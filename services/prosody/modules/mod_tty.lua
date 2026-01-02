-- mod_tty: Bidirectional TTY conversations via XMPP
-- Usage: Message 5122027765@tty.domain, send !start to begin call, !end to terminate

prosody.unlock_globals();
local redis = require 'redis';
local st = require 'util.stanza';
local jid_split = require 'util.jid'.split;
local json = require 'util.json';
local timer = require 'util.timer';
local uuid = require 'util.uuid';
local datamanager = require "util.datamanager";

-- Redis connection
function split_uri(uri)
    local i = string.find(uri, ":");
    return uri:sub(0, i - 1), uri:sub(i + 1);
end

function connect_redis()
  local host, port = split_uri(os.getenv("REDIS_HOST") or "127.0.0.1:6379");
  return redis.connect(host, port);
end

local connection = connect_redis();

-- Component setup
local component_host = module:get_host();
local component_name = module.name;

if module:get_host_type() ~= "component" then
    error(module.name.." should be loaded as a component", 0);
end

-- Session tracking: sessions[user_bjid][phone_number] = { session_id, status, started_at }
local sessions = {};

-- User management (similar to mod_sms)
local users = {};
local ttyuser = {};
ttyuser.__index = ttyuser;

setmetatable(users, { __index = function (table, key)
  return ttyuser:register(key);
end });

function ttyuser:new()
  local newuser = {};
  setmetatable(newuser, self);
  return newuser;
end

function ttyuser:register(bjid)
    local reguser = ttyuser:new();
    reguser.jid = bjid;
    reguser.data = datamanager.load(bjid, component_host, "data") or { roster = {} };
    users[bjid] = reguser;
    users[bjid]:store();
    return reguser;
end

function ttyuser:store()
    datamanager.store(self.jid, component_host, "data", self.data);
end

function ttyuser:roster_add(phone_number)
    if self.data.roster == nil then
        self.data.roster = {}
    end
    if self.data.roster[phone_number] == nil then
        self.data.roster[phone_number] = {screen_name = phone_number, subscription = 'subscribed'};
    end
    self:store();
    return self;
end

function ttyuser:roster_stanza_args(phone_number)
    if self.data.roster[phone_number] == nil then
        return nil
    end
    local args = {jid = phone_number .. "@" .. component_host, name = self.data.roster[phone_number].screen_name}
    if self.data.roster[phone_number].subscription ~= nil then
        args.subscription = self.data.roster[phone_number].subscription
    end
    return args
end

-- Get or create user session for a phone number
function get_session(user_bjid, phone_number)
    if sessions[user_bjid] == nil then
        sessions[user_bjid] = {};
    end
    return sessions[user_bjid][phone_number];
end

function set_session(user_bjid, phone_number, session_data)
    if sessions[user_bjid] == nil then
        sessions[user_bjid] = {};
    end
    sessions[user_bjid][phone_number] = session_data;
end

function clear_session(user_bjid, phone_number)
    if sessions[user_bjid] ~= nil then
        sessions[user_bjid][phone_number] = nil;
    end
end

-- Find session by session_id
function find_session_by_id(session_id)
    for user_bjid, user_sessions in pairs(sessions) do
        for phone_number, session in pairs(user_sessions) do
            if session and session.session_id == session_id then
                return user_bjid, phone_number, session;
            end
        end
    end
    return nil, nil, nil;
end

-- Send XMPP message to user
function send_message_to_user(from_number, to_user, message)
    local stanza = st.message({
        from = from_number .. '@' .. component_host,
        to = to_user .. '@' .. os.getenv("DOMAIN"),
        type = 'chat'
    }):tag('active', { xmlns = 'http://jabber.org/protocol/chatstates' }):up()
      :tag('body'):text(message);

    module:send(stanza);
end

-- Handle !start command
function handle_start_call(from_user, to_number)
    local user_bjid = from_user .. '@' .. os.getenv("DOMAIN");
    local existing = get_session(user_bjid, to_number);

    if existing and (existing.status == 'ringing' or existing.status == 'answered') then
        send_message_to_user(to_number, from_user, "Call already in progress. Send !end to terminate.");
        return;
    end

    -- Generate session ID
    local session_id = uuid.generate();

    -- Store session
    set_session(user_bjid, to_number, {
        session_id = session_id,
        status = 'initiating',
        started_at = os.time()
    });

    -- Add to user's roster
    users[user_bjid]:roster_add(to_number);

    -- Push command to tty-out queue
    local cmd = json.encode({
        action = 'start_call',
        session_id = session_id,
        from_user = from_user,
        to_number = to_number,
        timestamp = os.time()
    });

    connection:rpush('tty-out', cmd);
    module:log("info", "TTY call initiated: user=%s number=%s session=%s", from_user, to_number, session_id);
end

-- Handle !end command
function handle_end_call(from_user, to_number)
    local user_bjid = from_user .. '@' .. os.getenv("DOMAIN");
    local session = get_session(user_bjid, to_number);

    if not session then
        send_message_to_user(to_number, from_user, "No active call to end.");
        return;
    end

    -- Push end command to tty-out queue
    local cmd = json.encode({
        action = 'end_call',
        session_id = session.session_id
    });

    connection:rpush('tty-out', cmd);
    module:log("info", "TTY call end requested: session=%s", session.session_id);
end

-- Handle text message during active call
function handle_send_text(from_user, to_number, text)
    local user_bjid = from_user .. '@' .. os.getenv("DOMAIN");
    local session = get_session(user_bjid, to_number);

    if not session or session.status ~= 'answered' then
        send_message_to_user(to_number, from_user, "No active call. Send !start to begin a TTY call.");
        return;
    end

    -- Push text to tty-out queue
    local cmd = json.encode({
        action = 'send_text',
        session_id = session.session_id,
        text = text
    });

    connection:rpush('tty-out', cmd);
    module:log("debug", "TTY text sent: session=%s len=%d", session.session_id, #text);
end

-- Handle incoming messages from tty-in queue
function handle_incoming(msg)
    local decoded = json.decode(tostring(msg));

    if decoded.type == 'status' then
        handle_status_update(decoded);
    elseif decoded.type == 'text' then
        handle_incoming_text(decoded);
    end
end

function handle_status_update(data)
    local user_bjid, phone_number, session = find_session_by_id(data.session_id);

    if not session then
        module:log("warn", "Status update for unknown session: %s", data.session_id);
        return;
    end

    -- Update session status
    session.status = data.status;
    set_session(user_bjid, phone_number, session);

    -- Send status message to user
    send_message_to_user(data.from_number, data.to_user, data.message);

    -- If call ended, clean up session
    if data.status == 'ended' or data.status == 'failed' then
        clear_session(user_bjid, phone_number);
        module:log("info", "TTY session ended: session=%s status=%s", data.session_id, data.status);
    elseif data.status == 'answered' then
        module:log("info", "TTY call answered: session=%s", data.session_id);
    end
end

function handle_incoming_text(data)
    -- Send received text to user
    send_message_to_user(data.from_number, data.to_user, data.text);
    module:log("debug", "TTY text received: to=%s len=%d", data.to_user, #data.text);
end

-- Poll tty-in queue
function tick()
    local data = connection:lpop('tty-in');

    if data ~= nil then
        local ok, err = pcall(function() handle_incoming(data) end);
        if not ok then
            module:log("error", "Error handling tty-in message: %s", tostring(err));
        end
        -- Process next message immediately
        tick();
    else
        -- Poll every 1 second for responsiveness
        timer.add_task(1, function()
            tick()
        end);
    end
end

-- Message handler
function message_stanza_handler(event)
    local stanza, origin = event.stanza, event.origin;
    local to = {};
    local from = {};

    to.node, to.host, to.resource = jid_split(stanza.attr.to);
    from.node, from.host, from.resource = jid_split(stanza.attr.from);

    -- Get message body
    local body_tag = stanza:get_child('body');
    if not body_tag then
        return true;
    end
    local body = body_tag:get_text();
    if not body or body == '' then
        return true;
    end

    local from_user = from.node;
    local to_number = to.node;

    -- Validate phone number format (should be digits only)
    if not to_number or not to_number:match('^%d+$') then
        module:log("warn", "Invalid TTY destination: %s", tostring(to_number));
        return true;
    end

    -- Handle commands
    if body == '!start' then
        handle_start_call(from_user, to_number);
    elseif body == '!end' then
        handle_end_call(from_user, to_number);
    elseif body:sub(1, 1) == '!' then
        -- Unknown command
        send_message_to_user(to_number, from_user, "Unknown command. Use !start to begin a call, !end to terminate.");
    else
        -- Regular text - send to active call
        handle_send_text(from_user, to_number, body);
    end

    return true;
end

-- Presence handler
function presence_stanza_handler(origin, stanza)
    local to = {};
    local from = {};

    to.node, to.host, to.resource = jid_split(stanza.attr.to);
    from.node, from.host, from.resource = jid_split(stanza.attr.from);

    local from_bjid = nil;
    if from.node ~= nil and from.host ~= nil then
        from_bjid = from.node .. "@" .. from.host;
    elseif from.host ~= nil then
        from_bjid = from.host;
    end

    local to_bjid = nil;
    if to.node ~= nil and to.host ~= nil then
        to_bjid = to.node .. "@" .. to.host;
    end

    -- Send presence response
    origin.send(st.presence({ to = from_bjid, from = to_bjid }));

    if stanza.attr.type == 'subscribe' then
        origin.send(st.presence({ to = from_bjid, from = component_host, type = "subscribed" }));
    end

    return true;
end

-- IQ handler (disco, etc)
function iq_handle(event)
    local origin, stanza = event.origin, event.stanza;
    local to_node = jid_split(stanza.attr.to);

    if to_node == nil then
        local type = stanza.attr.type;
        if type == "error" or type == "result" then return; end

        if stanza.name == "iq" and type == "get" then
            local xmlns = stanza.tags[1] and stanza.tags[1].attr.xmlns;
            if xmlns == "http://jabber.org/protocol/disco#info" then
                local reply = st.reply(stanza):query("http://jabber.org/protocol/disco#info");
                reply:tag("identity", { category = 'gateway', type = 'tty', name = 'TTY Gateway' }):up();
                reply:tag("feature", { var = "http://jabber.org/protocol/commands" }):up();
                origin.send(reply);
                return true;
            end
        end
    end
end

function message_handle(event)
    return message_stanza_handler(event);
end

function presence_handle(event)
    local origin, stanza = event.origin, event.stanza;
    return presence_stanza_handler(origin, stanza);
end

-- Register features
module:add_feature("http://jabber.org/protocol/disco#info");
module:add_feature("http://jabber.org/protocol/disco#items");

-- Register hooks
module:hook("iq/bare", iq_handle);
module:hook("message/bare", message_handle);
module:hook("presence/bare", presence_handle);
module:hook("iq/full", iq_handle);
module:hook("message/full", message_handle);
module:hook("presence/full", presence_handle);
module:hook("iq/host", iq_handle);
module:hook("message/host", message_handle);

-- Start polling after 5 seconds
timer.add_task(5, function() tick() end);

module:log("info", "mod_tty loaded for %s", component_host);

extensions = {}

require 'socket';
local https = require 'ssl.https';
local json = require 'rapidjson';
local ltn12 = require 'ltn12';
local redis = require 'redis';


local lua_print = print;
function print (msg)
  if _G.app then app.verbose(msg); else lua_print(msg); end
end
function split_uri(uri)
    local i = string.find(uri, ":");
    return uri:sub(0, i - 1), uri:sub(i + 1);
end

function connect_redis()
  local host, port = split_uri(os.getenv("REDIS_HOST") or "127.0.0.1:6379");
  return redis.connect(host, port);
end


local cache = connect_redis();

function dialstring(num)
  return num:gsub('%*%#', 'w'):gsub('%*%*', '*');
end

function inbound_handler(context, extension)
  if cache:get('ghostem.' .. extension) then
    cache:rpush('calls-in', json.encode({ from=channel['CALLERID(num)']:get(), did=extension }));
    app.playback('ss-noservice');
    return app.hangup();
  end
  local did, ext = extension, extfor(extension);
  channel.did = did;
  channel.ext = ext;
  channel.sipuser = ext;
  channel.skip = cache:get('skip.' .. ext) or '';
  local sipuser = ext;
  app.mixmonitor(did .. '-' .. channel['CALLERID(num)']:get() .. '-' .. channel.UNIQUEID:get() .. '.wav', 'ab');
  channel.callerid_num = channel['CALLERID(num)']:get();
  channel.callerid_name = channel['CALLERID(name)']:get();
  channel.extension = extension;
  if not channel.callsin_status:get() then cache:rpush('calls-in', json.encode({ from=channel.callerid_num:get(), did=did })); end
  channel.did = did;
  channel.sipuser = ext;
  cache:set('last-called.' .. ext, channel.callerid_num:get());
  print("INBOUND CALL from " .. channel['CALLERID(all)']:get())
  print("DEST: " .. channel.sipuser:get() .. " " .. channel.did:get());
  if channel.callerid_num:get() == real_number then
    set_callerid(channel, channel.sipuser:get());
    return app.disa('no-password', channel.sipuser:get() .. '-context');
  end
  set_last_cid(channel, channel.callerid_num:get(), did);
  channel['CALLERID(name)'] = did .. ': ' .. channel['CALLERID(name)']:get();
  return dialsip(channel, ext);
end 

function read_sip_users()
  local state = 0;
  local set = {};
  for line in io.lines('/etc/asterisk/sip.conf') do
    local comment = line:match('^%s*;');
    if not comment then
      if line:match('^%s*%[%d+%]') then
        local user = line:match('([%d]+)');
        set[user] = true;
      end
    end
  end
  return set;
end

function read_voicemail_users()
  local set = {};
  local mailbox = 'default';
  local state = 0;
  for line in io.lines('/etc/asterisk/voicemail.conf') do
    local comment = line:match('^%s*;');
    if not comment then
      if state == 1 then
        if line:match('^%s*%[') then return set; end
        local user, pin = line:match('(%d+)%s*=>%s*(%d+)');
        if user then set[user] = pin; end
      elseif line:find('%[default%]') then
        state = 1;
      end
    end
  end
  return set;
end

function sip_account_to_uri(account)
  local found, _, user, host = account:find('^([^@]+)@([^:]+)');
  if not found then return false, '';  end
  return true, user .. '@' .. host;
end

function get_dial_argument(n)
  local match = n:match('#%*.*');
  if not match then return ''; end
  return 'D(' .. dialstring(match) .. ')';
end

function get_number_from_dial(n)
  local match = n:match('[^#]+');
  return match;
end

function emergency_filter(did, cid)
  if cache:get('emergency-passthrough.' .. did .. '.' .. cid) then
    return '877' .. cid:sub(4);
  end
  return cid;
end

function pstn_fallback_dial(channel)
  local ext = channel.extension:get()
  ext = extfor(ext) or ext;
  local number = cache:get('fallback.' .. ext);
  if not number then return 'CHANUNAVAIL'; end
  if channel.random:get() then channel.override = random_similar_number(number); end
  local outbound = cache:get('outbound.' .. channel.did:get()) or os.getenv("VOIPMS_SIP_USERNAME");
  number = #number == 10 and ('1' .. number) or number;
  local callerid_num, callerid_name = channel.callerid_num:get(), channel.callerid_name:get();
  set_callerid(channel, emergency_filter(ext, coerce_to_did(callerid_num)) or callerid_num);
--  channel['CALLERID(name)'] = channel.callerid_num:get() .. ': ' .. channel.callerid_name:get();
  print('dialing');
  local match = number:find('#%*(.*)')
  app.stopplaytones();
  local status = dial('SIP/' .. outbound .. '/' .. get_number_from_dial(number), 40, 'U(detect_voicemail,s,1)g' .. get_dial_argument(number));
  print(status);
  set_callerid(channel, callerid_num);
  channel['CALLERID(name)'] = callerid_name;
  return status;
end


local DEFAULT_OUTBOUND = 'SIP/' .. os.getenv("VOIPMS_SIP_USERNAME");

function activate_simple_mobile(callerid, simnumber, airtime, zipcode, pin)
  channel['CALLERID(num)'] = callerid;
  channel['CALLERID(name)'] = "WIRELESS CALLER";
  local payload = simnumber .. ':' .. airtime .. ':' .. pin .. ':' .. zipcode;
  return dial(DEFAULT_OUTBOUND .. '/18778787908', 20, 'U(activate_simple_mobile^' .. payload .. ')');
end
function voipms_carriertype(num)
  if #num < 10 then return false, 'I'; end
  local response = {};
  local err, status = https.request({
    method="GET",
    url="https://" .. os.getenv("TWILIO_ACCOUNT_SID") .. ":" .. os.getenv("TWILIO_AUTH_TOKEN") .. "@lookups.twilio.com/v1/PhoneNumbers/+" .. (#num == 11 and num or "1" .. num) .. "?Type=carrier",
    sink=ltn12.sink.table(response)
  });
  print(response[1]);
  local carrier_type = json.decode(response[1]).carrier.type;
  return false, carrier_type == 'voip' and 'V' or carrier_type == 'mobile' and 'M' or 'L';
end

function is_voip(num)
  local err, result = voipms_carriertype(num);
  print(num .. 'is a number of type ' .. result);
  if cache:get('voip-passthrough.' .. channel.sipuser:get()) then return false; end
  if err then
    return true;
  else
    return result == 'V';
  end
end

function is_blacklisted(channel, from)
  return (cache:get('blacklist.' .. from) or cache:get('blacklist.' .. channel.extension:get() .. '.' .. from) or cache:get('blacklist.' .. channel.did:get() .. '.' .. channel.callerid_num:get() .. '.' .. from));
end

function dial(...)
  app.dial(...);
  return channel.DIALSTATUS:get();
end

function set_callerid(channel, callerid)
  print('Setting CALLERID(num) to ' .. callerid);
  if #callerid == 10 then callerid = '1' .. callerid; end
  channel['CALLERID(num)'] = callerid;
end

local lfs = require 'lfs';

function write_voicemail_did(number)
  local dir = '/var/spool/asterisk/voicemail/default/' .. number;
  lfs.mkdir(dir);
  local filepath = '/var/spool/asterisk/voicemail/default/' .. number .. '/did.txt';
  local file = io.open(filepath, 'w');
  local extension = channel.extension:get();
  file:write(didfor(channel.extension:get(), nil) or extension);
  print('wrote voicemail for ext ' .. number .. ' at filepath ' .. filepath);
  file:close();
end

extensions.activate_simple_mobile = {
  s = function (context, extension)
    local simnumber, airtime, pin, zipcode = channel.ARG1:get():match('([^:]+)');
    if not simnumber or not airtime or not pin or not zipcode then
      channel.GOSUB_RESULT = 'ABORT';
      return app['return']();
    end
    app.wait(23);
    app.sendDTMF('2');
    app.wait(6.5);
    app.sendDTMF('2');
    app.wait(26);
    app.sendDTMF(simnumber);
    app.wait(14);
    text_to_speech('yes');
    app.wait(12);
    text_to_speech('no');
    app.wait(17);
    app.sendDTMF(airtime);
    app.wait(10);
    text_to_speech('yes');
    app.wait(10);
    app.sendDTMF(zipcode);
    app.wait(5);
    text_to_speech('yes');
    app.wait(15);
    app.sendDTMF(pin);
    app.wait(4.5);
    text_to_speech('yes');
    app.wait(49);
    text_to_speech('no');
    app.wait(10);
    channel.GOSUB_RESULT = 'CONTINUE';
    app['return']();
  end
};

function to_transcript_filename(s)
  return s:gsub('[^%w]', '-'):sub(1, 64):lower();
end

function text_to_speech(text)
  local filename = to_transcript_filename(text);
  app.system('text-to-speech \'' .. text .. '\'');
  
  print('filename: ' .. filename);
  app.playback(filename);
end
  

function send_to_voicemail(channel, number)
  print('write_voicemail_did');
  write_voicemail_did(number);
  print('wrote');
  print('number ' .. tostring(number));
  app.voicemail(number, 'u');
  app.hangup();
end

extensions.send_to_voicemail = {
  s = function (context, extension) 
    send_to_voicemail(channel, channel.voicemail_box:get());
  end
};

function primary_handler(channel)
  send_to_voicemail(channel, '555')
end

function compute_last_cid_key(sipuser, number)
  return 'last-cid.' .. sipuser .. '.' .. number;
end

function get_last_cid(number)
  return select(1, cache:get(compute_last_cid_key(channel.sipuser:get(), number)));
end

function set_last_cid(channel, number, did)
  cache:set(compute_last_cid_key(channel.sipuser:get(), number), did);
end

function random_similar_number(number)
  local result = coerce_to_did(number):sub(1, 6) .. tostring(math.random(1000, 9999))
  if result:sub(6, 10) == number:sub(6, 10) then
    return random_similar_number(number);
  end
  return result;
end

function didfor(ext, to)
  if #ext > 3 then return ext; end
  local inbound_didfor = channel.didfor:get();
  if inbound_didfor then
    return inbound_didfor;
  end
  if to then
    local did = cache:get('didfor.' .. ext .. '.' .. to);
    if did then return did; end
  end
  return cache:get('didfor.' .. ext);
end

function lookup_extension(sipuser)
  local ext = cache:get('extfordevice.' .. sipuser)
  if ext then return ext; end
  local sipusers = read_sip_users();
  for k, _ in pairs(sipusers) do
    if cache:hget('devicelist.' .. k, sipuser) then
      cache:set('extfordevice.' .. sipuser, k);
      return k;
    end
  end
  return nil;
end

function extfor(did)
  return cache:get('extfor.' .. did);
end

function dial_outbound(channel, number)
  number = string.gsub(number, '+', '')
  if #number >= 20 then
    channel.override = number:sub(0, 10);
    if not cache:get('superuser.' .. channel.sipuser:get()) and extfor(channel.override:get()) ~= channel.sipuser:get() then
      return app.hangup();
    end
    set_last_cid(channel, number, channel.override:get());
    return dial_outbound(channel, number:sub(11));
  end
  number = #number == 10 and ('1' .. number) or number;
  local outbound = cache:get('outbound.' .. ((channel.override and channel.override:get()) or channel.did:get())) or os.getenv("VOIPMS_SIP_USERNAME");
  if not channel.immutable_callerid:get() then set_callerid(channel, channel.override and channel.override:get() or get_last_cid(number) or channel.did:get()); end;
  if extensions.inbound[number] then return extensions.inbound[number](context, number); end
  local response = {};
  set_last_cid(channel, number, channel['CALLERID(num)']:get());
  return dial('SIP/' .. outbound .. '/' .. number);
 -- end
 -- return dial('SIP/' .. channel['CALLERID(num)']:get() .. ':ghostdial@' .. host.result .. ':35061/' .. number);
end

function format_dial_string(channel, outbound, number)
  local append = channel.afterdial:get()
end

function coerce_to_did(number)
  if #number >= 10 then return number; end
  return didfor(number) or number;
end
 
function hit_em_wit_jg_real_quick(channel)
  print("JG MODE ENGAGE 🔥");
  local sipuser = channel.sipuser:get();
  if sipuser == "303" then
    if #channel.callerid_num:get() == 10 then 
      channel.immutable_callerid = '1';
    end
    return dial_outbound(channel, '18772274669');
  end
  local did = coerce_to_did(channel.extension:get());
  send_to_voicemail(channel, extfor(did) or did);
end

function ring_group(to)
  local devices = cache:hkeys('devicelist.' .. to) or {};
  local withsip = {};
  table.insert(devices, to);
  for _, device in ipairs(devices) do
    table.insert(withsip, 'SIP/' .. device);
    print('SIP/' .. device);
  end
  return table.concat(withsip, '&');
end

function dialsip(channel, to, on_failure)
  local voip = is_voip(channel.callerid_num:get())
  if not is_blacklisted(channel, channel.callerid_num:get()) and not is_voip(channel.callerid_num:get())  then
    app.answer();
    set_last_cid(channel, channel.callerid_num:get(), channel.did:get());
    app.playtones('ring');
    local status = channel.skip:get() ~= 'sip' and dial(ring_group(to), 20) or 'CHANUNAVAIL';
    app.playtones('ring');
    if status == "CHANUNAVAIL" or status == "NOANSWER" and channel.skip:get() ~= "pstn" then 
	    status = pstn_fallback_dial(channel);
    end
    if status == "CHANUNAVAIL" or status == "BUSY" or status == "CONGESTED" or status == "NOANSWER" then
      return send_to_voicemail(channel, to)
    else
      return app.hangup();
    end
  else
    hit_em_wit_jg_real_quick(channel);
  end
end

function anonymous_device_handler(context, extension)
  local ext = lookup_extension(channel['CALLERID(num)']:get());
  channel.extcallerid = channel['CALLERID(num)']:get();
  if not ext then return app['goto']('global_disa_handler', extension, 1); end
  set_callerid(channel, ext);
  return app['goto']('authenticated', extension, 1);
end

extensions.anonymous_device = {
  ["_+."] = function (context, extension)
    return app['goto'](context, extension:sub(2), 1);
  end,
  ["_*."] = anonymous_device_handler,
  ["_X."] = anonymous_device_handler,
  ["*90"] = function (context, extension)
    local ext = lookup_extension(channel['CALLERID(num)']:get());
    cache:hdel('devicelist.' .. ext, channel['CALLERID(num)']:get());
    text_to_speech('sip device removed');
  end
}

extensions.inbound = {};
extensions.default = {
  ["1234"] = function (context, extension)
    return app.stasis("externalMedia");
  end
};
extensions.detect_voicemail = {
  s = function (context, extension)
    app.answer();
    app.amd();
    print("AMDSTATUS: " .. channel.AMDSTATUS:get());
    print("AMDCAUSE: " .. channel.AMDCAUSE:get());
    if channel.AMDSTATUS:get() == 'MACHINE' and channel.AMDCAUSE:get():match('LONGGREETING') then
      channel.GOSUB_RESULT = 'BUSY';
    end
    app['return']();
  end
};

function set_custom_extension(sipuser, key, value)
  local is_superuser = cache:get('superuser.' .. sipuser);
  if is_superuser then cache:set('custom-extension.' .. key, value); else cache:set('custom-extension.' .. sipuser .. '.' .. key, value); end
  print('SET CUSTOM EXTENSION ' .. key .. ' to ' .. value);
end

function get_custom_extension(sipuser, key)
  print('TRY CUSTOM EXTENSION: ' .. key);
  local value = cache:get('custom-extension.' .. sipuser .. '.' .. key) or cache:get('custom-extension.' .. key);
  value = value and value .. strip_out_dial_target(channel.extension_with_modifiers:get())
  if not value then print('NO CUSTOM EXTENSION FOR ' .. key); else print('VALUE: ' .. value); end
  return value;
end

function sip_handler(context, extension)
    local ext = channel['CALLERID(num)']:get();
    local did = didfor(ext, extension) or '8778888888';
    local sipuser = ext;
    app.mixmonitor(ext .. '-' .. extension .. '-' .. channel.UNIQUEID:get() .. '.wav', 'ab');
    channel.did = did;
    channel.sipuser = ext;
    channel.callerid_num = channel['CALLERID(num)']:get();
    channel.callerid_name = channel['CALLERID(name)']:get();
    channel.extension = extension;
    local override = cache:get('override.' .. ext);
    if override then channel.override = override; end
    print('OUTGOING CALL from ' .. ext .. ' to ' .. extension);
    local found, uri = sip_account_to_uri(extension);
    if found then
      print('DIALING EXTERNAL URI ' .. uri);
      return app.dial('SIP/' .. uri);
    end
    if #extension == 7 then
      local extghost = extension:sub(0, 4);
      local extext = extension:sub(5, 7);
      print("DIALING EXTERNAL SYSTEM LABELED " .. extghost);
      return app.dial("SIP/" .. extghost .. "/" .. channel.sipuser:get() .. extext);
    end
    local custom = get_custom_extension(ext, channel.extension_with_modifiers:get());
    if custom then
      return app['goto']('authenticated', custom, 1);
    end
    if (hooks[ext] or {})[extension] then
      return hooks[ext][extension](channel);
    elseif #extension < 10 then
      dialsip(channel, extension);
    else
      dial_outbound(channel, extension);
    end
end

function get_callerid()
  local callerid = channel['CALLERID(num)']:get();
  print('CALLERID(num) is ' .. callerid);
  return callerid;
end


function sip_decorate_handler(context, extension)
  local callerid = get_callerid();
  channel.sipuser = callerid;
  channel.ext = callerid;
  channel.did = didfor(callerid, extension) or '8778888888';
  channel.extension_with_modifiers = extension;
  channel.extension = get_extension(extension);
  local skip = cache:get('skip.' .. callerid);
  print('callerid');
  print(callerid);
  if skip then channel.skip = skip; end
  print('EXTENSION WITHOUT MODIFIERS: ' .. channel.extension:get());
  print('EXTENSION WITH MODIFIERS: ' .. channel.extension_with_modifiers:get());
  apply_modifiers(extension);
  return app['goto']('authenticated_internal', channel.extension:get(), 1);
end

local modifiers = {
  ["*"] = {
    callback = function (arg)
      set_custom_extension(channel.ext:get(), arg, remove_modifier(channel.extension_with_modifiers:get(), "*"));
    end,
    unary = false
  },
  ["0"] = {
    callback = function (arg)
      print("OVERRIDE CALLERID(num) TO " .. arg);
      channel.override = arg;
    end,
    unary = false
  },
  ["1"] = {
    callback = function (arg)
      print("OVERRIDE AND SAVE CALLERID(num) TO " .. arg);
      if #arg < 10 then cache:del('override.', channel.ext:get());
      else
        channel.override = arg;
        cache:set('override.' .. channel.ext:get(), arg);
      end
    end,
    unary = false
  },
  ["2"] = {
    callback = function ()
      channel.skip = 'sip';
    end,
    unary = true
  },
  ["3"] = {
    callback = function()
      channel.skip = 'pstn';
    end,
    unary = true
  },
  ["5"] = {
    callback = function ()
      channel.random = 'true';
    end,
    unary = true
  },
  ["7"] = {
    callback = function (arg)
      print("DRY RUN");
      channel.dry_run = 'true';
    end,
    unary = false
  }
};

function find(t, lambda)
  for k, v in ipairs(t) do
    if lambda(v, k) then return v; end
  end
  return nil;
end

function join_modifiers(modifiers)
  local result = '';
  for k, v in pairs(modifiers) do
    result = result .. '#' .. k;
    if v ~= true then result = result .. '#' .. v end;
  end
  return result;
end

function remove_modifier(extension, modifier)
  local without_modifiers = get_extension(extension);
  local modifiers = get_modifiers(extension);
  modifiers[modifier] = nil;
  return without_modifiers .. join_modifiers(modifiers);
end

function iter_to_table(i)
  local result = {};
  for v in i do
    table.insert(result, v);
  end
  return result
end

function to_parts(extension)
  return iter_to_table(extension:gmatch('([^#]+)'));
end

function get_extension(extension)
  return to_parts(extension)[1];
end

function get_modifiers(extension)
  local parts = to_parts(extension);
  local result = {};
  local modifier = nil;
  local next_is_key = true;
  for i, v in ipairs(parts) do
    if next_is_key then
      modifier = v;
      if (modifiers[v] or { unary = true }).unary then
        result[modifier] = true
      else
        next_is_key = false
      end
    else
      if modifier then result[modifier] = v; end
    end
  end
  return result
end

function strip_out_modifiers(extension)
  local modifier_table = get_modifiers(extension);
  for k, v in pairs(modifier_table) do
    if not modifiers[k] then return k; end
  end
  print("DIAL TARGET ABSENT .. ABORT");
  app.hangup();
  return '';
end

function strip_out_dial_target(extension)
  local modifier_table = get_modifiers(extension);
  for k, v in pairs(modifier_table) do
    if not modifiers[k] then modifier_table[k] = nil; end
  end
  local joined = join_modifiers(modifier_table);
  return joined == '' and joined or '#' .. joined;
end
  
function apply_modifiers(extension)
  print('EXTENSION WITH MODIFIERS: ' .. extension);
  local modifier_table = get_modifiers(extension);
  print(json.encode(modifier_table));
  local number = nil;
  for key, arg in pairs(modifier_table) do
    if not modifiers[key] then
      if not number then
        print("INTERPRETING " .. key .. " AS DIAL TARGET");
        number = key;
      else
        print("MODIFIER " .. key .. " NOT FOUND, ABORT!");
        return app.hangup();
      end
    else
      modifiers[key].callback(arg);
      print("MODIFIER " .. key .. " CALLED WITH " .. tostring(arg));
    end
  end
end

extensions.authenticated = {
  ["_X."] = sip_decorate_handler,
  ["_*."] = sip_decorate_handler,
  ["_+."] = function (context, extension)
    return sip_decorate_handler(context, extension:sub(1));
  end
};

extensions.stasis = {
  ["_X."] = function (context, extension)
    app.answer();
    app.stasis('ghoulbridge')
    app.hangup()
  end
}


function fallback_register_handler(context, extension)
      if #channel.extcallerid:get() < 10 then
        cache:hset('devicelist.' .. channel.sipuser:get(), channel.extcallerid:get(), 1);
	text_to_speech('sip telephone registered');
      else
        cache:set('fallback.' .. channel.sipuser:get(), channel.extcallerid:get() .. (#extension > 2 and extension:sub(3) or ''));
	text_to_speech('public telephone fallback set');
      end
      return app.hangup();
    end

extensions.authenticated_internal = {
    ["_X."] = sip_handler,
    ["_*76*."] = function (context, extension)
      local callerid, simnumber, airtime, zipcode, pin = extension:sub(4):match('([^%*]+)');
      return simple_mobile_activate(callerid, simnumber, airtime, zipcode, pin);
    end,
    ["*89"] = function (context, extension)
      return app.voicemailmain(get_callerid());
    end,
    ["*9"] = fallback_register_handler,
    ["*7"] = function (context, extension)
      local setting = cache:get('skip.' .. channel.sipuser:get());
      if setting then cache:del('skip.' .. channel.sipuser:get());
      else cache:set('skip.' .. channel.sipuser:get(), 'sip');
      end
    end,
    ["_*9."] = fallback_register_handler,
    ["_*1."] = function (context, extension)
      local ring_group = cache:get('custom-ring-group.' .. get_callerid() .. '.' .. extension:sub(3)) or cache:get('custom-ring-group.' .. extension:sub(3));
      return app.dial(ring_group, 30);
    end,
    ["*8"] = function (context, extension)
      app.answer();
      if #channel.extcallerid:get() < 10 then return app.hangup(); end
      cache:set('sms-fallback.' .. channel.sipuser:get(), channel.extcallerid:get());
      return app.hangup();
    end,
    ["*80"] = function (context, extension)
      app.answer();
      cache:del('sms-fallback.' .. channel.sipuser:get());
      text_to_speech('sms fallback deleted');
      return app.hangup();
    end,
    ["*90"] = function (context, extension)
      app.answer();
      cache:del('fallback.' .. channel.sipuser:get());
      text_to_speech('public telephone fallback deleted');
      return app.hangup();
    end,
    ["*5"] = function (context, extension)

      channel.text_mode = "rtt";
      channel.text_codec = "utf-8";
      app.AGI("agi://rtt-bridge:8080/rtt_bridge");
      app.hangup();
    end,
    [".*9X_"] = function (context, extension)
      local number = extension:sub(2);
      cache:set('fallback.' .. channel.sipuser:get(), number);
      return app.hangup();
    end,
    ["*69"] = function (context, extension)
      local override = get_last_cid(get_callerid());
      channel.override = override;
      return app['goto']('authenticated', cache:get('last-called.' .. get_callerid()), 1);
    end,
    ["_**X."] = function (context, extension)
      local extension_to_save, extension_record = extension:match('%*%*([^%*]+)%*(.*)$');
      set_custom_extension(channel.ext:get(), extension_to_save, extension_record);
      return app.hangup();
    end,
    ["01"] = function (context, extension)
      app.answer();
      return app.stasis("externalMedia");
    end,
    ["00"] = function (context, extension)
      return app.waitexten(20);
    end
  }; 
extensions.inbound = {
  ["t"] = function (context, extension)
    print("MISS DISA");
    channel.pass_waitexten = 'true';
    app.stopplaytones();
    return app['goto'](context, channel.extension:get(), 1);
  end,
  ["#"] = function (context, extension)
    app.stopplaytones();
    print("ENTER DISA");
    return app['goto']('global_disa', global_disa_did, 1);
  end,
  ["*"] = function (context, extension)
    return send_to_voicemail(channel, extfor(channel.extension:get()));
  end,
  ["_X."] = function (context, extension)
    if not channel.pass_waitexten:get() then
      channel.extension = extension;
      app.answer();
      if not cache:get('ghostem.' .. extension) then app.playtones('ring'); end
      channel.inbound = extension;
      return app.waitexten(6);
    end
    return inbound_handler(context, channel.extension:get());
  end
};

function external_handler(context, extension)
    if not extensions.inbound[extension] then return; end
    print('EXTERNAL CALL FROM ' .. channel['SIPDOMAIN']:get());
    channel.sipdomain = channel['SIPDOMAIN']:get();
    set_callerid(channel, channel['SIPUSER']):get();
    return extensions.inbound[extension](context, extension);
end

function set_outbound_callerid()
  set_callerid(channel, channel.override:get() or channel.did:get());
end

function send_to_zero_call(channel)
  set_outbound_callerid();
  local outbound = cache:get('outbound.' .. ((channel.override and channel.override:get()) or channel.did:get())) or os.getenv("VOIPMS_SIP_USERNAME")
  return dial('SIP/' .. outbound .. '/16176754444,,D(ww1308114334947#)');
end

hooks = {
  ["555"] = {
    ["990"] = function (context, extension) send_to_zero_call(channel); end,
    ["991"] = function (context, extension)
      set_outbound_callerid();
      return dial('SIP/' .. os.getenv("VOIPMS_SIP_USERNAME") .. '/18484568150,,D(111917636#)');
    end,
    ["4757772244"] = function (context, extension) return app.hangup(); end
  },
  ["420"] = {
    ["990"] = function (context, extension) send_to_zero_call(channel); end
  },
  ["562"] = {
    ["990"] = function (context, extension) send_to_zero_call(channel); end
  },
  ["715"] = {
    ["990"] = function (context, extension) send_to_zero_call(channel); end
  },
  ["287"] = {
    ["990"] = function (context, extension) send_to_zero_call(channel); end
  }
};

function add_pin(number, pin)
  local primary = extensions.inbound[number];
  extensions.inbound[number] = function (context, extension)
    cache:rpush('calls-in', json.encode({ from=channel.callerid_num:get(), did=did }));
    channel.callsin_status = 'done';

    app.authenticate(pin, nil, 4);
    return primary(context, extension);
  end
end


global_disa_did = '4755575777';

voicemail_users = read_voicemail_users();

extensions.global_disa = {
  [global_disa_did] = function (context, extension)
    app.answer();
    app.disa('no-password', 'global_disa_handler');
  end
};

extensions.global_disa_handler = {
  ['_X.'] = function (context, extension)
    local users = read_voicemail_users();
    local sipuser = extension:sub(1, 3);
    print('authenticate as: ' .. sipuser);
    if not users[sipuser] then return app.hangup(); end
    local pin = extension:sub(4, 3 + #users[sipuser]);
    print('try: ' .. pin);
    if users[sipuser] ~= pin then
      print('failure: wanted ' .. users[sipuser]);
      return app.hangup();
    end
    local extension = extension:sub(3 + #users[sipuser] + 1);
    channel.sipuser = sipuser;
    if extfor(channel.inbound:get() or '') == sipuser then
      channel.didfor = channel.inbound:get()
    end
    channel.extcallerid = channel['CALLERID(num)']:get();
    set_callerid(channel, sipuser);
    return app['goto']('authenticated', extension, 1);
  end
};
extensions.inbound[global_disa_did] = function (context, extension)
  app['goto']('global_disa', extension, 1);
end

function write_sip_accounts()
  local file = io.open('/etc/asterisk/sip.conf', 'w');
  for k, v in ipairs(sip) do
    file.write('[' .. k .. ']\n');
    for vk, vv in ipairs(v) do
      file.write(vk .. '=' .. vv .. '\n');
    end
  end
end

function setup_peer_contexts ()
  for i=1,9999 do
    local ext = string.format("%04d", i);
    extensions[ext] = {
      ["_XXXXXX"] = function (context, extension)
	local source_callerid = extension:sub(0, 3);
	local destination = extension:sub(4, 6);
        set_callerid(channel, ext .. source_callerid);
        channel.callerid_num = get_callerid();
	channel.sipuser = extension;
	channel.extension = extension;
	channel.did = didfor(extension, nil);
	return dialsip(channel, destination);
      end
    };
  end
end

setup_peer_contexts();

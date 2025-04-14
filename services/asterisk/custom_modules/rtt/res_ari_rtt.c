/*
 * Asterisk -- An open source telephony toolkit.
 *
 * Copyright (C) 2025, Project Ghost
 *
 * See http://www.asterisk.org for more information about
 * the Asterisk project. Please do not directly contact
 * any of the maintainers of this project for assistance;
 * the project provides a web site, mailing lists and IRC
 * channels for your use.
 *
 * This program is free software, distributed under the terms of
 * the GNU General Public License Version 2. See the LICENSE file
 * at the top of the source tree.
 */

/*! \file
 *
 * \brief Real-Time Text (RTT) integration with ARI
 *
 * \author Project Ghost
 */

/*** MODULEINFO
	<depend>res_rtt</depend>
	<depend>res_stasis_rtt</depend>
	<depend>res_ari</depend>
	<depend>res_ari_model</depend>
	<support_level>extended</support_level>
 ***/

#include "rtt_compat.h"
#include "asterisk.h"
#include "asterisk/module.h"
#include "asterisk/logger.h"
#include "asterisk/channel.h"
#include "asterisk/stasis.h"
#include "asterisk/stasis_channels.h"
#include "asterisk/json.h"
#include "asterisk/http.h"
#include "asterisk/ari.h"

/* External functions from res_rtt.c */
extern int ast_rtt_enable(struct ast_channel *chan);
extern int ast_rtt_disable(struct ast_channel *chan);
extern int ast_rtt_is_enabled(struct ast_channel *chan);

/* External functions from res_stasis_rtt.c */
extern struct stasis_topic *ast_rtt_topic(void);
extern struct stasis_message_type *ast_rtt_text_message_type(void);
extern struct stasis_message_type *ast_rtt_enabled_message_type(void);
extern struct stasis_message_type *ast_rtt_disabled_message_type(void);

/*! \brief Structure for RTT subscription */
struct rtt_subscription {
    struct ast_ari_websocket_session *session;  /*!< ARI websocket session */
    struct stasis_subscription *subscription;   /*!< Stasis subscription */
};

/*! \brief Container for RTT subscriptions */
static struct ao2_container *rtt_subscriptions;

/*! \brief Hash function for RTT subscription */
static int rtt_subscription_hash(const void *obj, const int flags)
{
    const struct rtt_subscription *sub = obj;
    const struct ast_ari_websocket_session *session = flags & OBJ_KEY ? obj : sub->session;
    
    return ast_str_hash(ast_ari_websocket_session_id(session));
}

/*! \brief Comparison function for RTT subscription */
static int rtt_subscription_cmp(void *obj, void *arg, int flags)
{
    struct rtt_subscription *sub1 = obj;
    struct rtt_subscription *sub2 = arg;
    const struct ast_ari_websocket_session *session2 = flags & OBJ_KEY ? arg : sub2->session;
    
    return sub1->session == session2 ? CMP_MATCH | CMP_STOP : 0;
}

/*! \brief Callback for RTT events */
static void rtt_event_cb(void *data, struct stasis_subscription *sub,
                         struct stasis_message *message)
{
    struct rtt_subscription *rtt_sub = data;
    struct ast_json *json;
    
    if (!rtt_sub || !message) {
        return;
    }
    
    /* Check if this is an RTT message */
    if (stasis_message_type(message) != ast_rtt_text_message_type() &&
        stasis_message_type(message) != ast_rtt_enabled_message_type() &&
        stasis_message_type(message) != ast_rtt_disabled_message_type()) {
        return;
    }
    
    /* Convert the message to JSON */
    json = stasis_message_to_json(message, NULL);
    if (!json) {
        ast_log(LOG_ERROR, "Failed to convert RTT message to JSON\n");
        return;
    }
    
    /* Add the type field */
    if (stasis_message_type(message) == ast_rtt_text_message_type()) {
        ast_json_object_set(json, "type", ast_json_string_create("RTTTextReceived"));
    } else if (stasis_message_type(message) == ast_rtt_enabled_message_type()) {
        ast_json_object_set(json, "type", ast_json_string_create("RTTEnabled"));
    } else if (stasis_message_type(message) == ast_rtt_disabled_message_type()) {
        ast_json_object_set(json, "type", ast_json_string_create("RTTDisabled"));
    }
    
    /* Send the event to the websocket */
    ast_ari_websocket_session_write(rtt_sub->session, json);
    ast_json_unref(json);
}

/*! \brief Destructor for RTT subscription */
static void rtt_subscription_destroy(void *obj)
{
    struct rtt_subscription *sub = obj;
    
    if (!sub) {
        return;
    }
    
    /* Unsubscribe from stasis events */
    stasis_unsubscribe(sub->subscription);
    sub->subscription = NULL;
}

/*! \brief Subscribe to RTT events */
static void *rtt_subscribe_cb(struct ast_tcptls_session_instance *session,
                              struct ast_ari_websocket_session *ws_session,
                              struct ast_variable *headers,
                              struct ast_ari_response *response)
{
    struct rtt_subscription *sub;
    
    /* Check if already subscribed */
    sub = ao2_find(rtt_subscriptions, ws_session, OBJ_KEY);
    if (sub) {
        ao2_ref(sub, -1);
        ast_ari_response_error(response, 409, "Conflict", "Already subscribed to RTT events");
        return NULL;
    }
    
    /* Create a new subscription */
    sub = ao2_alloc(sizeof(*sub), rtt_subscription_destroy);
    if (!sub) {
        ast_ari_response_error(response, 500, "Internal Server Error", "Failed to allocate RTT subscription");
        return NULL;
    }
    
    sub->session = ws_session;
    
    /* Subscribe to RTT events */
    sub->subscription = stasis_subscribe(ast_rtt_topic(), rtt_event_cb, sub);
    if (!sub->subscription) {
        ao2_ref(sub, -1);
        ast_ari_response_error(response, 500, "Internal Server Error", "Failed to subscribe to RTT events");
        return NULL;
    }
    
    /* Add to container */
    ao2_link(rtt_subscriptions, sub);
    
    /* Success */
    ast_ari_response_no_content(response);
    
    return sub;
}

/*! \brief Unsubscribe from RTT events */
static void rtt_unsubscribe_cb(struct ast_tcptls_session_instance *session,
                               struct ast_ari_websocket_session *ws_session,
                               void *obj)
{
    struct rtt_subscription *sub = obj;
    
    if (!sub) {
        return;
    }
    
    /* Remove from container */
    ao2_unlink(rtt_subscriptions, sub);
    ao2_ref(sub, -1);
}

/*! \brief Enable RTT on a channel */
static void rtt_enable_cb(struct ast_tcptls_session_instance *session,
                          struct ast_variable *headers,
                          struct ast_ari_response *response,
                          const char *channel_id)
{
    struct ast_channel *chan;
    
    /* Get the channel */
    chan = ast_channel_get_by_name(channel_id);
    if (!chan) {
        ast_ari_response_error(response, 404, "Not Found", "Channel not found");
        return;
    }
    
    /* Enable RTT */
    if (ast_rtt_enable(chan) != 0) {
        ast_channel_unref(chan);
        ast_ari_response_error(response, 500, "Internal Server Error", "Failed to enable RTT");
        return;
    }
    
    ast_channel_unref(chan);
    
    /* Success */
    ast_ari_response_no_content(response);
}

/*! \brief Disable RTT on a channel */
static void rtt_disable_cb(struct ast_tcptls_session_instance *session,
                           struct ast_variable *headers,
                           struct ast_ari_response *response,
                           const char *channel_id)
{
    struct ast_channel *chan;
    
    /* Get the channel */
    chan = ast_channel_get_by_name(channel_id);
    if (!chan) {
        ast_ari_response_error(response, 404, "Not Found", "Channel not found");
        return;
    }
    
    /* Disable RTT */
    if (ast_rtt_disable(chan) != 0) {
        ast_channel_unref(chan);
        ast_ari_response_error(response, 500, "Internal Server Error", "Failed to disable RTT");
        return;
    }
    
    ast_channel_unref(chan);
    
    /* Success */
    ast_ari_response_no_content(response);
}

/*! \brief Get RTT status for a channel */
static void rtt_status_cb(struct ast_tcptls_session_instance *session,
                          struct ast_variable *headers,
                          struct ast_ari_response *response,
                          const char *channel_id)
{
    struct ast_channel *chan;
    struct ast_json *json;
    
    /* Get the channel */
    chan = ast_channel_get_by_name(channel_id);
    if (!chan) {
        ast_ari_response_error(response, 404, "Not Found", "Channel not found");
        return;
    }
    
    /* Create JSON response */
    json = ast_json_pack("{s: s, s: b}",
                         "channel_id", channel_id,
                         "enabled", ast_rtt_is_enabled(chan));
    
    ast_channel_unref(chan);
    
    if (!json) {
        ast_ari_response_error(response, 500, "Internal Server Error", "Failed to create response");
        return;
    }
    
    /* Success */
    ast_ari_response_ok(response, json);
}

/*! \brief ARI RTT commands */
static struct stasis_rest_handlers rtt_handlers = {
    .path_segment = "rtt",
    .callbacks = {
        [AST_HTTP_GET] = rtt_status_cb,
        [AST_HTTP_POST] = rtt_enable_cb,
        [AST_HTTP_DELETE] = rtt_disable_cb,
    },
    .num_children = 0,
    .children = NULL,
};

/*! \brief ARI RTT websocket operations */
static struct ast_ari_websocket_events rtt_events = {
    .path = "rtt",
    .callbacks = {
        [AST_HTTP_GET] = rtt_subscribe_cb,
    },
    .on_close_cb = rtt_unsubscribe_cb,
};

static int unload_module(void)
{
    /* Unregister ARI resources */
    ast_ari_remove_handler(&rtt_handlers);
    ast_ari_websocket_remove_event(&rtt_events);
    
    /* Destroy subscriptions container */
    ao2_cleanup(rtt_subscriptions);
    rtt_subscriptions = NULL;
    
    ast_log(LOG_NOTICE, "Real-Time Text (RTT) ARI integration module unloaded\n");
    
    return 0;
}

static int load_module(void)
{
    /* Create subscriptions container */
    rtt_subscriptions = ao2_container_alloc_hash(AO2_ALLOC_OPT_LOCK_MUTEX, 0,
                                                17, rtt_subscription_hash,
                                                NULL, rtt_subscription_cmp);
    if (!rtt_subscriptions) {
        ast_log(LOG_ERROR, "Failed to create RTT subscriptions container\n");
        return AST_MODULE_LOAD_DECLINE;
    }
    
    /* Register ARI resources */
    if (ast_ari_add_handler(&rtt_handlers) != 0) {
        ast_log(LOG_ERROR, "Failed to register RTT ARI handler\n");
        unload_module();
        return AST_MODULE_LOAD_DECLINE;
    }
    
    AST_MODULE_INFO(ASTERISK_GPL_KEY, AST_MODFLAG_LOAD_ORDER, "Real-Time Text (RTT) ARI Integration",
        .support_level = AST_MODULE_SUPPORT_EXTENDED,
        .load = load_module,
        .unload = unload_module,
        .requires = "res_rtt,res_stasis_rtt,res_ari,res_ari_model",
    );
    
    if (ast_ari_websocket_add_event(&rtt_events) != 0) {
        ast_log(LOG_ERROR, "Failed to register RTT ARI websocket event\n");
        unload_module();
        return AST_MODULE_LOAD_DECLINE;
    }
    
    ast_log(LOG_NOTICE, "Real-Time Text (RTT) ARI integration module loaded\n");
    
    return AST_MODULE_LOAD_SUCCESS;
}
/* Use our custom module info macro */
RTT_MODULE_INFO(ASTERISK_GPL_KEY, AST_MODFLAG_LOAD_ORDER, "Real-Time Text (RTT) ARI Integration",
    .support_level = AST_MODULE_SUPPORT_EXTENDED,
    .requires = "res_rtt,res_stasis_rtt,res_ari,res_ari_model"
);
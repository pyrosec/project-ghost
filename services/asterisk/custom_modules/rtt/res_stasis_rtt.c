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
 * \brief Real-Time Text (RTT) integration with Stasis
 *
 * \author Project Ghost
 */

/*** MODULEINFO
	<depend>res_rtt</depend>
	<depend>res_stasis</depend>
	<support_level>extended</support_level>
 ***/

#include "asterisk.h"

#include "asterisk/module.h"
#include "asterisk/logger.h"
#include "asterisk/channel.h"
#include "asterisk/format.h"
#include "asterisk/format_cache.h"
#include "asterisk/frame.h"
#include "asterisk/stasis.h"
#include "asterisk/stasis_channels.h"
#include "asterisk/json.h"
#include "asterisk/utils.h"

/* External functions from res_rtt.c */
extern int ast_rtt_enable(struct ast_channel *chan);
extern int ast_rtt_disable(struct ast_channel *chan);
extern int ast_rtt_is_enabled(struct ast_channel *chan);

/*! \brief Topic for RTT events */
static struct stasis_topic *rtt_topic;

/*! \brief Message type for RTT text received */
static struct stasis_message_type *rtt_text_message_type;

/*! \brief Message type for RTT enabled */
static struct stasis_message_type *rtt_enabled_message_type;

/*! \brief Message type for RTT disabled */
static struct stasis_message_type *rtt_disabled_message_type;

/*! \brief Structure for RTT text message */
struct rtt_text_message {
    struct ast_channel_snapshot *snapshot;  /*!< Channel snapshot */
    char *text;                            /*!< RTT text */
    int is_final;                          /*!< Whether this is a final text */
};

/*! \brief Structure for RTT enabled/disabled message */
struct rtt_status_message {
    struct ast_channel_snapshot *snapshot;  /*!< Channel snapshot */
};

/*! \brief Convert RTT text message to JSON */
static struct ast_json *rtt_text_to_json(struct stasis_message *msg)
{
    struct rtt_text_message *rtt_msg = stasis_message_data(msg);
    
    if (!rtt_msg) {
        return NULL;
    }
    
    return ast_json_pack("{s: o, s: s, s: i}",
                        "channel", ast_channel_snapshot_to_json(rtt_msg->snapshot, NULL),
                        "text", rtt_msg->text,
                        "is_final", rtt_msg->is_final);
}

/*! \brief Convert RTT status message to JSON */
static struct ast_json *rtt_status_to_json(struct stasis_message *msg)
{
    struct rtt_status_message *rtt_msg = stasis_message_data(msg);
    
    if (!rtt_msg) {
        return NULL;
    }
    
    return ast_json_pack("{s: o}",
                        "channel", ast_channel_snapshot_to_json(rtt_msg->snapshot, NULL));
}

/*! \brief Free RTT text message */
static void rtt_text_message_destroy(void *obj)
{
    struct rtt_text_message *rtt_msg = obj;
    
    if (!rtt_msg) {
        return;
    }
    
    ao2_cleanup(rtt_msg->snapshot);
    ast_free(rtt_msg->text);
    
    return;
}

/*! \brief Free RTT status message */
static void rtt_status_message_destroy(void *obj)
{
    struct rtt_status_message *rtt_msg = obj;
    
    if (!rtt_msg) {
        return;
    }
    
    ao2_cleanup(rtt_msg->snapshot);
    
    return;
}

/*! \brief Publish RTT text received event */
int ast_rtt_publish_text(struct ast_channel *chan, const char *text, int is_final)
{
    struct ast_channel_snapshot *snapshot;
    struct rtt_text_message *rtt_msg;
    struct stasis_message *msg;
    
    if (!chan || !text) {
        return -1;
    }
    
    /* Take a snapshot of the channel */
    snapshot = ast_channel_snapshot_create(chan);
    if (!snapshot) {
        ast_log(LOG_ERROR, "Failed to create channel snapshot for RTT text event\n");
        return -1;
    }
    
    /* Create the RTT text message */
    rtt_msg = ao2_alloc(sizeof(*rtt_msg), rtt_text_message_destroy);
    if (!rtt_msg) {
        ao2_ref(snapshot, -1);
        return -1;
    }
    
    rtt_msg->snapshot = snapshot;
    rtt_msg->text = ast_strdup(text);
    rtt_msg->is_final = is_final;
    
    if (!rtt_msg->text) {
        ao2_ref(rtt_msg, -1);
        return -1;
    }
    
    /* Create and publish the stasis message */
    msg = stasis_message_create(rtt_text_message_type, rtt_msg);
    if (!msg) {
        ao2_ref(rtt_msg, -1);
        return -1;
    }
    
    stasis_publish(rtt_topic, msg);
    ao2_ref(msg, -1);
    
    return 0;
}

/*! \brief Publish RTT enabled event */
int ast_rtt_publish_enabled(struct ast_channel *chan)
{
    struct ast_channel_snapshot *snapshot;
    struct rtt_status_message *rtt_msg;
    struct stasis_message *msg;
    
    if (!chan) {
        return -1;
    }
    
    /* Take a snapshot of the channel */
    snapshot = ast_channel_snapshot_create(chan);
    if (!snapshot) {
        ast_log(LOG_ERROR, "Failed to create channel snapshot for RTT enabled event\n");
        return -1;
    }
    
    /* Create the RTT status message */
    rtt_msg = ao2_alloc(sizeof(*rtt_msg), rtt_status_message_destroy);
    if (!rtt_msg) {
        ao2_ref(snapshot, -1);
        return -1;
    }
    
    rtt_msg->snapshot = snapshot;
    
    /* Create and publish the stasis message */
    msg = stasis_message_create(rtt_enabled_message_type, rtt_msg);
    if (!msg) {
        ao2_ref(rtt_msg, -1);
        return -1;
    }
    
    stasis_publish(rtt_topic, msg);
    ao2_ref(msg, -1);
    
    return 0;
}

/*! \brief Publish RTT disabled event */
int ast_rtt_publish_disabled(struct ast_channel *chan)
{
    struct ast_channel_snapshot *snapshot;
    struct rtt_status_message *rtt_msg;
    struct stasis_message *msg;
    
    if (!chan) {
        return -1;
    }
    
    /* Take a snapshot of the channel */
    snapshot = ast_channel_snapshot_create(chan);
    if (!snapshot) {
        ast_log(LOG_ERROR, "Failed to create channel snapshot for RTT disabled event\n");
        return -1;
    }
    
    /* Create the RTT status message */
    rtt_msg = ao2_alloc(sizeof(*rtt_msg), rtt_status_message_destroy);
    if (!rtt_msg) {
        ao2_ref(snapshot, -1);
        return -1;
    }
    
    rtt_msg->snapshot = snapshot;
    
    /* Create and publish the stasis message */
    msg = stasis_message_create(rtt_disabled_message_type, rtt_msg);
    if (!msg) {
        ao2_ref(rtt_msg, -1);
        return -1;
    }
    
    stasis_publish(rtt_topic, msg);
    ao2_ref(msg, -1);
    
    return 0;
}

/*! \brief Get the RTT topic */
struct stasis_topic *ast_rtt_topic(void)
{
    return rtt_topic;
}

/*! \brief Get the RTT text message type */
struct stasis_message_type *ast_rtt_text_message_type(void)
{
    return rtt_text_message_type;
}

/*! \brief Get the RTT enabled message type */
struct stasis_message_type *ast_rtt_enabled_message_type(void)
{
    return rtt_enabled_message_type;
}

/*! \brief Get the RTT disabled message type */
struct stasis_message_type *ast_rtt_disabled_message_type(void)
{
    return rtt_disabled_message_type;
}

static int unload_module(void)
{
    /* Unregister message types */
    ao2_cleanup(rtt_text_message_type);
    rtt_text_message_type = NULL;
    
    ao2_cleanup(rtt_enabled_message_type);
    rtt_enabled_message_type = NULL;
    
    ao2_cleanup(rtt_disabled_message_type);
    rtt_disabled_message_type = NULL;
    
    /* Unregister topic */
    ao2_cleanup(rtt_topic);
    rtt_topic = NULL;
    
    ast_log(LOG_NOTICE, "Real-Time Text (RTT) Stasis integration module unloaded\n");
    
    return 0;
}

static int load_module(void)
{
    /* Create topic */
    rtt_topic = stasis_topic_create("rtt:all");
    if (!rtt_topic) {
        ast_log(LOG_ERROR, "Failed to create RTT topic\n");
        return AST_MODULE_LOAD_DECLINE;
    }
    
    /* Create message types */
    rtt_text_message_type = stasis_message_type_create("rtt:text",
                                                     rtt_text_to_json);
    if (!rtt_text_message_type) {
        ast_log(LOG_ERROR, "Failed to create RTT text message type\n");
        unload_module();
        return AST_MODULE_LOAD_DECLINE;
    }
    
    rtt_enabled_message_type = stasis_message_type_create("rtt:enabled",
                                                        rtt_status_to_json);
    if (!rtt_enabled_message_type) {
        ast_log(LOG_ERROR, "Failed to create RTT enabled message type\n");
        unload_module();
        return AST_MODULE_LOAD_DECLINE;
    }
    
    rtt_disabled_message_type = stasis_message_type_create("rtt:disabled",
                                                         rtt_status_to_json);
    if (!rtt_disabled_message_type) {
        ast_log(LOG_ERROR, "Failed to create RTT disabled message type\n");
        unload_module();
        return AST_MODULE_LOAD_DECLINE;
    }
    
    ast_log(LOG_NOTICE, "Real-Time Text (RTT) Stasis integration module loaded\n");
    
    return AST_MODULE_LOAD_SUCCESS;
}

AST_MODULE_INFO_STANDARD(ASTERISK_GPL_KEY, "Real-Time Text (RTT) Stasis Integration");
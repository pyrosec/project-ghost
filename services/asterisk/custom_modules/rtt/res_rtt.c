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
 * \brief Real-Time Text (RTT) support for Asterisk
 *
 * \author Project Ghost
 */

/*** MODULEINFO
	<support_level>extended</support_level>
 ***/

#include "asterisk.h"

#include "asterisk/module.h"
#include "asterisk/logger.h"
#include "asterisk/channel.h"
#include "asterisk/format.h"
#include "asterisk/format_cache.h"
#include "asterisk/frame.h"
#include "asterisk/rtp_engine.h"
#include "asterisk/utils.h"
#include "asterisk/linkedlists.h"
#include "asterisk/lock.h"
#include "asterisk/astobj2.h"

/*! \brief Structure for RTT session */
struct rtt_session {
    char *id;                  /*!< Unique session ID */
    struct ast_channel *chan;  /*!< Associated channel */
    AST_LIST_ENTRY(rtt_session) list;  /*!< Next session in the list */
    ast_mutex_t lock;          /*!< Lock for this session */
};

/*! \brief Container for all active RTT sessions */
static AST_LIST_HEAD_STATIC(sessions, rtt_session);

/*! \brief Create a new RTT session */
static struct rtt_session *rtt_session_create(struct ast_channel *chan)
{
    struct rtt_session *session;
    
    if (!chan) {
        ast_log(LOG_ERROR, "Cannot create RTT session without a channel\n");
        return NULL;
    }
    
    session = ast_calloc(1, sizeof(*session));
    if (!session) {
        ast_log(LOG_ERROR, "Failed to allocate RTT session\n");
        return NULL;
    }
    
    session->id = ast_strdup(ast_channel_uniqueid(chan));
    if (!session->id) {
        ast_free(session);
        return NULL;
    }
    
    session->chan = chan;
    ast_mutex_init(&session->lock);
    
    ast_debug(1, "Created RTT session %s for channel %s\n", 
              session->id, ast_channel_name(chan));
    
    return session;
}

/*! \brief Destroy an RTT session */
static void rtt_session_destroy(struct rtt_session *session)
{
    if (!session) {
        return;
    }
    
    ast_debug(1, "Destroying RTT session %s\n", session->id);
    
    ast_mutex_destroy(&session->lock);
    ast_free(session->id);
    ast_free(session);
}

/*! \brief Find an RTT session by channel */
static struct rtt_session *rtt_session_find_by_channel(struct ast_channel *chan)
{
    struct rtt_session *session;
    
    if (!chan) {
        return NULL;
    }
    
    AST_LIST_LOCK(&sessions);
    AST_LIST_TRAVERSE(&sessions, session, list) {
        if (session->chan == chan) {
            break;
        }
    }
    AST_LIST_UNLOCK(&sessions);
    
    return session;
}

/*! \brief Add an RTT session to the global list */
static void rtt_session_add(struct rtt_session *session)
{
    if (!session) {
        return;
    }
    
    AST_LIST_LOCK(&sessions);
    AST_LIST_INSERT_TAIL(&sessions, session, list);
    AST_LIST_UNLOCK(&sessions);
}

/*! \brief Remove an RTT session from the global list */
static void rtt_session_remove(struct rtt_session *session)
{
    if (!session) {
        return;
    }
    
    AST_LIST_LOCK(&sessions);
    AST_LIST_REMOVE(&sessions, session, list);
    AST_LIST_UNLOCK(&sessions);
}

/*! \brief Enable RTT on a channel */
int ast_rtt_enable(struct ast_channel *chan)
{
    struct rtt_session *session;
    
    if (!chan) {
        ast_log(LOG_ERROR, "Cannot enable RTT on NULL channel\n");
        return -1;
    }
    
    /* Check if RTT is already enabled on this channel */
    session = rtt_session_find_by_channel(chan);
    if (session) {
        ast_debug(1, "RTT already enabled on channel %s\n", ast_channel_name(chan));
        return 0;
    }
    
    /* Create a new RTT session */
    session = rtt_session_create(chan);
    if (!session) {
        ast_log(LOG_ERROR, "Failed to create RTT session for channel %s\n", 
                ast_channel_name(chan));
        return -1;
    }
    
    /* Add the session to the global list */
    rtt_session_add(session);
    
    ast_debug(1, "RTT enabled on channel %s\n", ast_channel_name(chan));
    
    return 0;
}

/*! \brief Disable RTT on a channel */
int ast_rtt_disable(struct ast_channel *chan)
{
    struct rtt_session *session;
    
    if (!chan) {
        ast_log(LOG_ERROR, "Cannot disable RTT on NULL channel\n");
        return -1;
    }
    
    /* Find the RTT session for this channel */
    session = rtt_session_find_by_channel(chan);
    if (!session) {
        ast_debug(1, "RTT not enabled on channel %s\n", ast_channel_name(chan));
        return 0;
    }
    
    /* Remove the session from the global list */
    rtt_session_remove(session);
    
    /* Destroy the session */
    rtt_session_destroy(session);
    
    ast_debug(1, "RTT disabled on channel %s\n", ast_channel_name(chan));
    
    return 0;
}

/*! \brief Check if RTT is enabled on a channel */
int ast_rtt_is_enabled(struct ast_channel *chan)
{
    struct rtt_session *session;
    
    if (!chan) {
        return 0;
    }
    
    session = rtt_session_find_by_channel(chan);
    
    return session != NULL;
}

/*! \brief Handle an RTT text frame */
int ast_rtt_handle_text_frame(struct ast_channel *chan, struct ast_frame *frame)
{
    struct rtt_session *session;
    
    if (!chan || !frame) {
        return -1;
    }
    
    /* Check if this is a text frame */
    if (frame->frametype != AST_FRAME_TEXT) {
        return -1;
    }
    
    /* Check if RTT is enabled on this channel */
    session = rtt_session_find_by_channel(chan);
    if (!session) {
        ast_debug(1, "Received text frame on channel %s but RTT is not enabled\n", 
                  ast_channel_name(chan));
        return -1;
    }
    
    /* Log the RTT text */
    if (frame->datalen > 0 && frame->data.ptr) {
        char *text = ast_alloca(frame->datalen + 1);
        memcpy(text, frame->data.ptr, frame->datalen);
        text[frame->datalen] = '\0';
        
        ast_log(LOG_NOTICE, "RTT TEXT RECEIVED (Channel %s): %s\n", 
                ast_channel_name(chan), text);
    }
    
    return 0;
}

static int unload_module(void)
{
    struct rtt_session *session;
    
    /* Clean up any remaining sessions */
    AST_LIST_LOCK(&sessions);
    while ((session = AST_LIST_REMOVE_HEAD(&sessions, list))) {
        rtt_session_destroy(session);
    }
    AST_LIST_UNLOCK(&sessions);
    
    ast_log(LOG_NOTICE, "Real-Time Text (RTT) module unloaded\n");
    
    return 0;
}

static int load_module(void)
{
    ast_log(LOG_NOTICE, "Real-Time Text (RTT) module loaded\n");
    
    return AST_MODULE_LOAD_SUCCESS;
}

AST_MODULE_INFO_STANDARD(ASTERISK_GPL_KEY, "Real-Time Text (RTT) Support");
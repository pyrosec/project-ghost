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
 * \brief Real-Time Text (RTT) integration with Asterisk core
 *
 * \author Project Ghost
 */

/*** MODULEINFO
	<depend>res_rtt</depend>
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
#include "asterisk/app.h"
#include "asterisk/pbx.h"
#include "asterisk/cli.h"

/* External functions from res_rtt.c */
extern int ast_rtt_enable(struct ast_channel *chan);
extern int ast_rtt_disable(struct ast_channel *chan);
extern int ast_rtt_is_enabled(struct ast_channel *chan);
extern int ast_rtt_handle_text_frame(struct ast_channel *chan, struct ast_frame *frame);

/*! \brief Channel hook for intercepting text frames */
static int rtt_channel_hook(struct ast_channel *chan, struct ast_frame *frame, enum ast_frame_delivery delivery, void *data)
{
    /* Only process frames being read from the channel */
    if (delivery != AST_FRAME_READ) {
        return 0;
    }
    
    /* Check if this is a text frame */
    if (frame->frametype != AST_FRAME_TEXT) {
        return 0;
    }
    
    /* Handle the RTT text frame */
    ast_rtt_handle_text_frame(chan, frame);
    
    return 0;
}

/*! \brief Structure for channel hook */
static const struct ast_channel_hook_info rtt_hook_info = {
    .version = AST_CHANNEL_HOOK_VERSION,
    .after_read_frame = rtt_channel_hook,
    .data = NULL,
};

/*! \brief Channel hook token */
static struct ast_channel_hook *rtt_hook;

/*! \brief Enable RTT on a channel from the dialplan */
static int rtt_enable_exec(struct ast_channel *chan, const char *data)
{
    if (!chan) {
        return -1;
    }
    
    return ast_rtt_enable(chan);
}

/*! \brief Disable RTT on a channel from the dialplan */
static int rtt_disable_exec(struct ast_channel *chan, const char *data)
{
    if (!chan) {
        return -1;
    }
    
    return ast_rtt_disable(chan);
}

/*! \brief Check if RTT is enabled on a channel from the dialplan */
static int rtt_is_enabled_exec(struct ast_channel *chan, const char *data, char *buf, size_t len)
{
    if (!chan) {
        return -1;
    }
    
    snprintf(buf, len, "%d", ast_rtt_is_enabled(chan));
    
    return 0;
}

/*! \brief CLI command to show RTT status */
static char *handle_cli_rtt_status(struct ast_cli_entry *e, int cmd, struct ast_cli_args *a)
{
    struct ast_channel *chan;
    
    switch (cmd) {
    case CLI_INIT:
        e->command = "rtt status";
        e->usage =
            "Usage: rtt status [channel_name]\n"
            "       Shows the status of Real-Time Text (RTT) for all channels or a specific channel.\n";
        return NULL;
    case CLI_GENERATE:
        if (a->pos == 2) {
            return ast_complete_channels(a->line, a->word, a->pos, a->n, 2);
        }
        return NULL;
    }
    
    if (a->argc == 2) {
        /* Show RTT status for all channels */
        struct ast_channel_iterator *iter;
        
        ast_cli(a->fd, "Real-Time Text (RTT) Status:\n");
        ast_cli(a->fd, "-------------------------\n");
        
        iter = ast_channel_iterator_all_new();
        if (!iter) {
            ast_cli(a->fd, "Memory allocation failed\n");
            return CLI_FAILURE;
        }
        
        for (; (chan = ast_channel_iterator_next(iter)); ast_channel_unref(chan)) {
            ast_cli(a->fd, "Channel: %s, RTT: %s\n", 
                    ast_channel_name(chan), 
                    ast_rtt_is_enabled(chan) ? "Enabled" : "Disabled");
        }
        
        ast_channel_iterator_destroy(iter);
    } else if (a->argc == 3) {
        /* Show RTT status for a specific channel */
        chan = ast_channel_get_by_name(a->argv[2]);
        if (!chan) {
            ast_cli(a->fd, "No such channel: %s\n", a->argv[2]);
            return CLI_FAILURE;
        }
        
        ast_cli(a->fd, "Channel: %s, RTT: %s\n", 
                ast_channel_name(chan), 
                ast_rtt_is_enabled(chan) ? "Enabled" : "Disabled");
        
        ast_channel_unref(chan);
    } else {
        return CLI_SHOWUSAGE;
    }
    
    return CLI_SUCCESS;
}

/*! \brief CLI command to enable RTT on a channel */
static char *handle_cli_rtt_enable(struct ast_cli_entry *e, int cmd, struct ast_cli_args *a)
{
    struct ast_channel *chan;
    
    switch (cmd) {
    case CLI_INIT:
        e->command = "rtt enable";
        e->usage =
            "Usage: rtt enable <channel_name>\n"
            "       Enables Real-Time Text (RTT) on the specified channel.\n";
        return NULL;
    case CLI_GENERATE:
        if (a->pos == 2) {
            return ast_complete_channels(a->line, a->word, a->pos, a->n, 2);
        }
        return NULL;
    }
    
    if (a->argc != 3) {
        return CLI_SHOWUSAGE;
    }
    
    chan = ast_channel_get_by_name(a->argv[2]);
    if (!chan) {
        ast_cli(a->fd, "No such channel: %s\n", a->argv[2]);
        return CLI_FAILURE;
    }
    
    if (ast_rtt_enable(chan) == 0) {
        ast_cli(a->fd, "RTT enabled on channel %s\n", ast_channel_name(chan));
    } else {
        ast_cli(a->fd, "Failed to enable RTT on channel %s\n", ast_channel_name(chan));
    }
    
    ast_channel_unref(chan);
    
    return CLI_SUCCESS;
}

/*! \brief CLI command to disable RTT on a channel */
static char *handle_cli_rtt_disable(struct ast_cli_entry *e, int cmd, struct ast_cli_args *a)
{
    struct ast_channel *chan;
    
    switch (cmd) {
    case CLI_INIT:
        e->command = "rtt disable";
        e->usage =
            "Usage: rtt disable <channel_name>\n"
            "       Disables Real-Time Text (RTT) on the specified channel.\n";
        return NULL;
    case CLI_GENERATE:
        if (a->pos == 2) {
            return ast_complete_channels(a->line, a->word, a->pos, a->n, 2);
        }
        return NULL;
    }
    
    if (a->argc != 3) {
        return CLI_SHOWUSAGE;
    }
    
    chan = ast_channel_get_by_name(a->argv[2]);
    if (!chan) {
        ast_cli(a->fd, "No such channel: %s\n", a->argv[2]);
        return CLI_FAILURE;
    }
    
    if (ast_rtt_disable(chan) == 0) {
        ast_cli(a->fd, "RTT disabled on channel %s\n", ast_channel_name(chan));
    } else {
        ast_cli(a->fd, "Failed to disable RTT on channel %s\n", ast_channel_name(chan));
    }
    
    ast_channel_unref(chan);
    
    return CLI_SUCCESS;
}

/*! \brief CLI commands */
static struct ast_cli_entry cli_rtt[] = {
    AST_CLI_DEFINE(handle_cli_rtt_status, "Show RTT status"),
    AST_CLI_DEFINE(handle_cli_rtt_enable, "Enable RTT on a channel"),
    AST_CLI_DEFINE(handle_cli_rtt_disable, "Disable RTT on a channel"),
};

static int unload_module(void)
{
    int res = 0;
    
    /* Unregister CLI commands */
    ast_cli_unregister_multiple(cli_rtt, ARRAY_LEN(cli_rtt));
    
    /* Unregister dialplan applications */
    res |= ast_unregister_application("RTTEnable");
    res |= ast_unregister_application("RTTDisable");
    
    /* Unregister dialplan function */
    res |= ast_custom_function_unregister(&rtt_is_enabled_function);
    
    /* Remove channel hook */
    if (rtt_hook) {
        ast_channel_hook_remove(rtt_hook);
        rtt_hook = NULL;
    }
    
    ast_log(LOG_NOTICE, "Real-Time Text (RTT) Asterisk integration module unloaded\n");
    
    return res;
}

static int load_module(void)
{
    int res = 0;
    
    /* Register channel hook */
    rtt_hook = ast_channel_hook_add(NULL, &rtt_hook_info);
    if (!rtt_hook) {
        ast_log(LOG_ERROR, "Failed to register RTT channel hook\n");
        return AST_MODULE_LOAD_DECLINE;
    }
    
    /* Register dialplan applications */
    res |= ast_register_application_xml("RTTEnable", rtt_enable_exec);
    res |= ast_register_application_xml("RTTDisable", rtt_disable_exec);
    
    /* Register dialplan function */
    static struct ast_custom_function rtt_is_enabled_function = {
        .name = "RTT_IS_ENABLED",
        .read = rtt_is_enabled_exec,
    };
    res |= ast_custom_function_register(&rtt_is_enabled_function);
    
    /* Register CLI commands */
    ast_cli_register_multiple(cli_rtt, ARRAY_LEN(cli_rtt));
    
    if (res) {
        unload_module();
        return AST_MODULE_LOAD_DECLINE;
    }
    
    ast_log(LOG_NOTICE, "Real-Time Text (RTT) Asterisk integration module loaded\n");
    
    return AST_MODULE_LOAD_SUCCESS;
}

AST_MODULE_INFO_STANDARD(ASTERISK_GPL_KEY, "Real-Time Text (RTT) Asterisk Integration");
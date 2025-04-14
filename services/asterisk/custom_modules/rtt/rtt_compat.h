/*! \file
 *
 * \brief Compatibility layer for RTT modules
 *
 * \author Project Ghost
 */

#ifndef RTT_COMPAT_H
#define RTT_COMPAT_H

/*
 * RTT Compatibility Layer for Asterisk 20.5.0
 *
 * This file provides compatibility between Asterisk 15.7 and 20.5.0 APIs
 * for the RTT (Real-Time Text) modules.
 */

#ifndef RTT_COMPAT_H
#define RTT_COMPAT_H

/*
 * This is a minimal compatibility layer that avoids including any Asterisk headers
 * to prevent conflicts. We'll define the bare minimum needed for our modules to compile.
 */

/* Module return values - match Asterisk's values */
#define AST_MODULE_LOAD_SUCCESS 0
#define AST_MODULE_LOAD_DECLINE 1
#define AST_MODULE_LOAD_FAILURE 2
#define AST_MODULE_LOAD_SKIP 3

/* Forward declarations for Asterisk types */
struct ast_channel;
struct ast_frame;
struct ast_module_info;

/* Function declarations for RTT API */
int ast_rtt_enable(struct ast_channel *chan);
int ast_rtt_disable(struct ast_channel *chan);
int ast_rtt_is_enabled(struct ast_channel *chan);
int ast_rtt_handle_text_frame(struct ast_channel *chan, struct ast_frame *frame);

#endif /* RTT_COMPAT_H */

#endif /* RTT_COMPAT_H */
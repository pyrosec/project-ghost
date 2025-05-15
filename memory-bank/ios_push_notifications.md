# iOS Push Notifications for XMPP (Monal)

This document explains how we've configured iOS push notifications for the Monal XMPP client in our Prosody server.

## Configuration Overview

We've made the following changes to enable iOS push notifications:

1. Installed required Prosody modules:
   - `mod_cloud_notify` - Handles cloud notification functionality
   - `mod_push` - Core push notification module implementing XEP-0357
   - `mod_push_http` - Forwards push notifications via HTTP to push services
   - `mod_unified_push` - Supports the UnifiedPush protocol

2. Configured push notification settings in Prosody:
   - Enabled push notification modules globally and for our virtual host
   - Configured push notification parameters (message body, sender info, etc.)
   - Set up HTTP endpoints for the Monal push service

3. Updated the Dockerfile to install all necessary dependencies

## Files Modified

1. `services/prosody/Dockerfile`
   - Added installation of required modules: mod_push, mod_push_http, mod_unified_push
   - Added lua-http dependency for APNS support

2. `services/prosody/templates/prosody.cfg.lua.tpl`
   - Added push-related modules to the global modules_enabled list

3. `services/prosody/templates/server.cfg.lua.tpl`
   - Added push-related modules to the virtual host's modules_enabled list

4. `services/prosody/templates/push_notification.cfg.lua.tpl` (new file)
   - Added configuration for push notification services
   - Configured APNS settings for Monal
   - Set up HTTP endpoints for push notifications

5. `services/prosody/docker-entrypoint.sh`
   - Updated to include the push notification configuration file

## Client Configuration (Monal)

To use push notifications in Monal:

1. Install the latest version of Monal from the App Store
2. Add your XMPP account or update your existing account
3. Go to Settings > Your Account > Push Notifications
4. Enable push notifications
5. Ensure that notifications are enabled for Monal in iOS Settings

## Testing Push Notifications

To test if push notifications are working:

1. Configure Monal with push notifications enabled
2. Put the app in the background or close it
3. Send a message to the user from another account
4. Verify that a push notification appears on the iOS device

## Troubleshooting

If push notifications aren't working:

1. Check Prosody logs: `docker-compose logs prosody`
2. Verify that the push service is reachable from your Prosody server
3. Ensure the iOS client has properly registered with the push service
4. Check that the iOS device has an active internet connection
5. Verify that notifications are enabled for the Monal app in iOS settings

## References

- [XEP-0357: Push Notifications](https://xmpp.org/extensions/xep-0357.html)
- [Prosody mod_cloud_notify Documentation](https://modules.prosody.im/mod_cloud_notify.html)
- [Prosody mod_push Documentation](https://modules.prosody.im/mod_push.html)
- [Prosody mod_push_http Documentation](https://modules.prosody.im/mod_push_http.html)
- [Monal Push Notification Documentation](https://github.com/monal-im/Monal/wiki/Push-Notifications)
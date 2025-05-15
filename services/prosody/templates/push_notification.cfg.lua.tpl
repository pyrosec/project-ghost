-- Push notification configuration for iOS clients

-- Configure mod_cloud_notify
push_notification_important_body = "New message received";
push_notification_with_body = true;  -- Include message body in push notifications
push_notification_with_sender = true;  -- Include sender information in push notifications
push_max_errors = 10;  -- Number of allowed consecutive errors before disabling push for a user

-- Configure mod_push
push_notification_app_id = "im.monal.monal";  -- Monal app identifier
push_notification_app_server = "https://push.monal.im/";
push_max_devices = 5;  -- Maximum number of devices per user

-- Configure mod_push_http endpoints
push_http_endpoints = {
    ["apns:https://push.monal.im/api/v2/push"] = {
        type = "apns";  -- Apple Push Notification Service
        url = "https://push.monal.im/api/v2/push";
        content_type = "application/json";
    }
}

-- Configure mod_unified_push
http_paths = {
    push = {
        path = "/push";  -- The HTTP endpoint for push notifications
    };
}
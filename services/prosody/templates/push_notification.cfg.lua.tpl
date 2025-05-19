-- Push notification configuration for iOS clients

-- Configure mod_cloud_notify
push_notification_important_body = "New message received";
push_notification_with_body = true;  -- Include message body in push notifications
push_notification_with_sender = true;  -- Include sender information in push notifications
push_max_errors = 10;  -- Number of allowed consecutive errors before disabling push for a user

-- Monal iOS specific configuration
push_notification_app_id = "im.monal.monal";  -- Monal app identifier
push_notification_app_server = "https://push.monal.im/";
push_max_devices = 5;  -- Maximum number of devices per user

-- Configure mod_cloud_notify_extensions for Monal
cloud_notify_extensions = {
    ["apns:im.monal.monal"] = {
        priority = "high",
        ttl = 86400,
        include_body = true,
        include_sender = true,
        api_endpoint = "https://push.monal.im/api/v2/push",
        api_key = "",  -- No API key needed for Monal's public push service
        headers = {
            ["Content-Type"] = "application/json"
        }
    }
}

-- HTTP paths for push endpoints
http_paths = {
    push = {
        path = "/push";  -- The HTTP endpoint for push notifications
    };
}

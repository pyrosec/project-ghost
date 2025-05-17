-- Section for example.com


VirtualHost "$DOMAIN"
	enabled = true -- Remove this line to enable this host
	-- Assign this host a certificate for TLS, otherwise it would use the one
	-- set in the global section (if any).
	-- Note that old-style SSL on port 5223 only supports one certificate, and will always
	-- use the global one.
	ssl = {
		key = "$TLS_PRIVATE_KEY";
		certificate = "$TLS_CERTIFICATE";
	}
	
	modules_enabled = {
		"cloud_notify"; -- Enable push notifications for this host
	}

Component "sms.$DOMAIN" "sms"
  modules_enabled = {
    "mam"
  }

Component "conference.$DOMAIN" "muc"

Component "upload.$DOMAIN" "http_file_share"
  http_host = "$DOMAIN"
  http_default_host = "$DOMAIN"
  http_file_share_base_url = "https://$DOMAIN"
  http_external_url = "https://$DOMAIN"


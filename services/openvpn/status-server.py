#!/usr/bin/env python3
"""Simple HTTP server that returns OpenVPN status as JSON."""

import http.server
import json
import os
from datetime import datetime

STATUS_FILE = '/var/log/openvpn/openvpn-status.log'
PORT = 8081


def parse_status_file():
    """Parse OpenVPN status log and return as dict."""
    if not os.path.exists(STATUS_FILE):
        return {'error': 'Status file not found', 'clients': [], 'routes': []}

    with open(STATUS_FILE, 'r') as f:
        lines = f.readlines()

    result = {
        'updated': None,
        'clients': [],
        'routes': [],
        'global_stats': {}
    }

    section = None
    for line in lines:
        line = line.strip()
        if not line or line == 'END':
            continue

        if line.startswith('Updated,'):
            result['updated'] = line.split(',', 1)[1]
        elif line == 'OpenVPN CLIENT LIST':
            section = 'header'
        elif line.startswith('Common Name,'):
            section = 'clients'
        elif line == 'ROUTING TABLE':
            section = 'route_header'
        elif line.startswith('Virtual Address,'):
            section = 'routes'
        elif line == 'GLOBAL STATS':
            section = 'stats'
        elif section == 'clients':
            parts = line.split(',')
            if len(parts) >= 5:
                result['clients'].append({
                    'common_name': parts[0],
                    'real_address': parts[1],
                    'bytes_received': int(parts[2]),
                    'bytes_sent': int(parts[3]),
                    'connected_since': parts[4]
                })
        elif section == 'routes':
            parts = line.split(',')
            if len(parts) >= 4:
                result['routes'].append({
                    'virtual_address': parts[0],
                    'common_name': parts[1],
                    'real_address': parts[2],
                    'last_ref': parts[3]
                })
        elif section == 'stats':
            if ',' in line:
                key, value = line.split(',', 1)
                result['global_stats'][key] = value

    return result


class StatusHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/status' or self.path == '/':
            status = parse_status_file()
            response = json.dumps(status, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(response))
            self.end_headers()
            self.wfile.write(response.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress logging


if __name__ == '__main__':
    server = http.server.HTTPServer(('0.0.0.0', PORT), StatusHandler)
    print(f'OpenVPN status server running on port {PORT}')
    server.serve_forever()

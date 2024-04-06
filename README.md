# project-ghost

Ghostdial is the communications framework designed for project ghost, a project written by ghosts, for ghosts.

## Using project-ghost

If you've been onboarded to project ghost, then congratulations, ghost! Your life will now be exciting and action packed. You will need to set up this repo, to get started.

You need to install a SIP client to make secure calls and an XMPP client to use SMS/MMS/voicemail/dossi.

Here is a breakdown of the apps you will use:

| Platform | SIP Client | XMPP Client |
| ----------- | ----------- | ----------- |
| Android | Acrobits Groundwire | Conversations (F-Droid version) |
| iOS | Acrobits Groundwire | Siskin IM |
| Linux | linphone | dino-im |
| Mac OSX | linphone | Gajim |
| Windows | linphone | Gajim |

Any SIP or XMPP client can work, but a lot of the others have poor support nowadays.

To connect to the SIP server with the SIP client, use

Generic SIP account
username: \<your project ghost extension\>
password: \<your project ghost password\>
domain: \<domain\>
port: 35061

Change only the following settings in the SIP account, and leave the others unchanged in your client:

NAT Traversal:
STUN Server: \<STUN server info\>
STUN Port: \<STUN server port\>

Encryption/Secure Calls:
SRTP: Enabled/Best Effort
DTLS: Enabled/Best Effort

Audio Codecs:
Drag g.711 ulaw to the top, it is the only one that is used

On your XMPP client, register a new account using your 10-digit number on the network:

JID: \<your 10-digit number\>@\<XMPP server\>
Password: \<your project ghost password\>

You will receive SMS/MMS/voicemail here, and you will also be able to message dossi. dossi will message you a background check on any call that comes in.

## dossi

dossi is a command prompt. You can say the following things to dossi to get it to do things. We will use 4048609911 as a sample phone number, ghostguy as a sample username, and ghostguy@gmail.com as a sample E-mail:

```sh
You: 4048609911
dossi: <carrier info for phone number>

You: pipl 4048609911
dossi: <background check on person who uses 4048609911>

You: pipl ghostguy@gmail.com
dossi: <background check on person who uses ghostguy@gmail.com>

You: pipl raw_name:"Karl Ghostenheim" state:GA city:Atlanta
dossi: <background check on Karl Ghostenheim that is most relevant to search terms>

You: pipl raw_name:"Karl Ghostenheim" state:CA city:Marietta age:20-30
dossi: <background check with narrower search terms>

You: sherlock ghostguy
dossi: <list of places the username ghostguy has been used, using the sherlock tool>

You: whatsmyname ghostguy
dossi: <list of places the username ghostguy has been used, using the whatsmyname tool>

You: socialscan ghostguy
dossi: <list of places the username ghostguy has been used, using the whatsmyname tool>

You: socialscan ghostguy@gmail.com
dossi: <list of places the username ghostguy has been used, using the whatsmyname tool>

You: holehe ghostguy@gmail.com
dossi: <list of places the email ghostguy@gmail.com has been used, using holehe>

You: searchdids type:starts query:512 state:TX
dossi: <list of phone numbers available to add to your extension>

You: orderdid 4048609911
dossi: <adds 4048609911 to the list of DIDs associated with your extension, be sure to create a new XMPP account for it to claim the number on the project ghost server!>

```

Other commands are available if needed, ask a ghost for details.

## Making calls

Use your SIP client to place calls over mobile data or Wi-Fi. It can work behind a VPN too, as long as it supports UDP (OpenVPN, ProtonVPN, etc).

Calling a 3-digit extension for a ghost works. The call will be e2e encrypted.

Placing a regular phone call works, too. It will ring using your default ghost number.

To place a call from a different number, dial the number you want to show up on the caller ID first, followed by the number you want to reach. For example, if I want to call 4045550001 using the number 4047770001, then I would dial

40477700014045550001

Technically, you can use any number as the source number, and it will spoof it no matter what. Just take care to spoof valid area codes and a valid triplet following the area code, or your call may be blocked.

To save an extension you can dial

\*\*\<extension to save\>\*\<dial string\>

It will save it for everyone on project ghost, so if you want to share a contact to a ghost, it is possible to simply save an extension for it. The extension you save can be a 20-digit spoof dial as well, for convenience.

For example, to make it so if someone on project ghost dials 404, it will spoof 4047770001 and call 4045550001, you can dial

\*\*404\*40477700014045550001

If you just want to make it so when someone dials 404 it will use their own number to dial 4045550001, you would dial

\*\*404\*4045550001

If it works, the call will simply end

### Changing PIN

Dial extension \*89 to get to the voicemail setup. The voicemail PIN functions as your PIN across project ghost, for dialing in from your regular phone dialer, as well.

### Dialing from a regular dialer

Sometimes, as a ghost, your phone will get struck by a bullet and it won't be able to be used after that. You will perhaps have a backup flip phone in case this happens. You can dial into project ghost from any phone, luckily. Here is the process:

1. Dial your own 10-digit ghost number
2. When it begins to ring, press # in the first 6 seconds
3. When you hear a dial tone, dial your ghost extension, your ghost PIN, and then the dial string you want to place as if you were dialing from your SIP client

Any ghostdial dial string will work after your extension and PIN, so you can save extensions, spoof numbers, and dial numbers from your ghost number all the same.

You will want to know how to use the "add 2s wait" feature to a dial with your phone's dialer, so you can dial everything all at once, instead of having to wait for the proper tones and quickly enter the correct sequence into your dialer. On Android and Tracfone there is an options menu available while you are dialing which has a "add 2s wait" button. On iOS, sometimes, you have to hold the # button to get access to the "," symbol. A comma symbol in a regular dial string means "add 2s wait".

When you dial in with your phone dialer instead of a SIP client, there are a couple important things to know. The choice of which 10-digit number that you dial to dial into the system matters. Without entering the number to spoof it explicitly, ghostdial will use the number that you dialed in through as the caller ID for any call you place.

There are also 4 special extensions you can use when dialing in from a phone dialer. There is

- \*9  register the calling number to receive calls for your extension over the phone lines, as a fallback, if there is no answer on the SIP client
- \*90  unregister any number that is registered to receive fallback calls
- \*8  register the calling number to receive text messages for your extension over pure SMS/MMS
- \*80  unregister any number that is registered to receive fallback SMS/MMS

For example, if I am able to find a Tracfone at a drug store, near where I am taking shelter from a firefight, then I am in luck. If my ghost number is 4048609911, my ghost extension is 404, and my ghost PIN is 888888, then I can dial

4048609911,#,404888888\*9

Now the Tracfone will receive calls, until I can get a proper ghost phone set up again.

But, if I need to call for reinforcements, and I know that ghost 779 is nearby, I can dial him at

4048609911,#,404888888779

779's SIP client will ring and he will see 404 on his caller ID, as if I were using a SIP client. He will respond with air support and the operation will succeed. Freedom is saved. Good work, ghost.


### Fallback SMS/MMS

When you receive fallback SMS/MMS, it will always text you from your own ghost number. The number that received the message from outside project ghost will be used to relay the message to the number registered with extension \*8

Each message that comes in will be prefixed with a 4-digit number, which indicates a unique source phone number.

If you see a message like this, you can use the `tag` command to enumerate the source number, or you can respond to it by prefixing a response to the thread with that tag.

```sh
4048609911: (8542) Hello, do you need air support
You: tag 8542
4048609911: 4048609911:4041012223
// ^this indicates we are receiving the text from 4041012223, and to reply to this number, we use the 8542 prefix
You: 8542 Sorry, wrong number
// ^This responds to the 4041012223 number, using the 4048609911 as the sender. Everything except for the 8542 tag is sent.
```

## Running a ghostdial server (NEW 2024)

Provision a VPS via any hosting provider. If you are hosting project ghost on bare metal, skip this step. Yes, you can set up project ghost to use a server you host at home, even with a FXO card so it can dial/receive as a landline.

VPS hosts I prefer are [https://bitlaunch.io](https://bitlaunch.io) since it only requires to pay in crypto. Provisioning on AWS with an anonymous account is more involved but I generally will use a Google account I create with a cheap but genuine prepaid Android phone from a department store, then [https://textverified.com](https://textverified.com) for the OTP (tooling available at [https://github.com/pyrosec/textverified](https://github.com/pyrosec/textverified). In this case I use gift cards to pay from [https://coinsbee.com](https://coinsbee.com) (tooling again available on pyrosec at [https://github.com/pyrosec/coinsbee](https://github.com/pyrosec/coinsbee).

Provisioning on Google cloud can also be done by cycling through $300 trial accounts, but it requires proper methodology in orchestrating your Google accounts. The best way is with genuine phones or pre-made PVAs on the secondary market, which is more cost effective long-term.

In a later step we will use a Google Cloud trial account when we set up voicemail, but bitlaunch.io is likely the best way to get up and running.

Once your VPS is provisioned, set up a domain with namecheap.com. It is possible to pay with cryptocurrency for namecheap.com as well, if you create the account and credit the namecheap with a balance prior to making the domain.

Create a free cloudflare.com account and add your domain. Set nameservers on your domain in the namecheap.com configuration to the nameservers Cloudflare provides, then create an A record for the domain name set to the IP address of your VPS. I generally will set up improvmx.com as well to get free mail forwarding for the domain.

It is acceptable to provision a VPS and configure DNS for it by any means you prefer, if the above instructions are not your usual methods.

Create an account at [https://voip.ms](https://voip.ms) and KYC. The fastest way to KYC is to immediately start a live chat with the voip.ms support team and send an ID to them manually. Once the account is activated, credit the account with a balance so the account can be used to provision phone lines.

Paying in cryptocurrency is possible with a AMEX prepaid gift card available on: [https://coinsbee.com](https://coinsbee.com)

Within the account settings of voip.ms, enable API usage for the IP address you will run project ghost from. You will need the API password in your project ghost .env file.

Create a SIP subaccount and password in the voip.ms UI. Configure the subaccount such that voip.ms does not set callerid for you (there is an option to indicate that your system is capable of setting its own caller ID.

In the SIP subaccount configuration, enable SIP traffic encryption, or else you will not be able to place calls.

Create a Twilio trial account and record the SID / auth token. Search the account configuration on the Twilio dashboard for the SID, which should be the one starting with `AC`. The auth token you should be able to reveal right below, which should be a lowercase hex string if you have found the right secret.

Twilio does not bill much for their phone lookup APIs, so the trial account should be enough for quite a while. When it runs out, you can cycle to a new Google account for a new trial account and swap keys.

Activate a gcloud trial account at [https://console.cloud.google.com](https://console.cloud.google.com) and serviceaccount.json with full permissions. Name the JSON serviceaccount.json, as we will copy it to ghostdb/gcloud/serviceaccount.json once we create the file hierarchy for your project-ghost filesystem database.

We are only using gcloud to power our ghostly voicemail transcription and persistence, so the $300 credit will last forever.

Within the gcloud console, activate the speech-to-text APIs and also create a storage bucket and record the name for it.

Get recaptcha API keys for your domain. The procedure is simple:

Create the keys here [https://www.google.com/recaptcha/admin/create](https://www.google.com/recaptcha/admin/create). Set the label to anything you want. Set the type to reCAPTCHA v2 using the "I'm not a robot" Checkbox option (this is the only thing that will work with synapse). Go to the settings page for the CAPTCHA you just created. Uncheck the "Verify the origin of reCAPTCHA solutions" checkbox so that the captcha can be displayed in any client. If you do not disable this option then you must specify the domains of every client that is allowed to display the CAPTCHA.

If you are unable, for any reason, to ascertain your public IP address to set the EXTERNIP variable to in the .env file we discuss in the next section, use the command:

```sh
curl https://ipinfo.io/json
```

Now you are ready to run project ghost on the server you have launched.

Ensure that docker and docker-compose are available on the system.

```sh
git clone https://github.com/ghostdial/ghostdial
mkdir ~/ghostdb
```

Create an .env file in the `ghostdial/` directory with contents as follows:

```
EXTERNIP=<public IP address of server>
EMAIL=<email to be used with certbot>
VOIPMS_SIP_USERNAME=<sip subaccount>
VOIPMS_SIP_PASSWORD=<sip subaccount password>
VOIPMS_SIP_HOST=208.100.60.17
VOIPMS_SIP_PORT=5060
VOIPMS_SIP_PROTOCOL=udp
TWILIO_ACCOUNT_SID=<twilio account SID>
TWILIO_AUTH_TOKEN=<twilio auth token>
VOICEMAIL_BUCKET=<name of gcloud storage bucket for voicemail>
PROJECT_GHOST_DATABASE=<path to directory where ghostdial files will live, /root/ghostdb in our example>
VOIPMS_API_USERNAME=<voipms username>
VOIPMS_API_PASSWORD=<voipms API password>
DOMAIN=<domain name for ghostdial server>
ROOT_PASSWORD=<pick any root password and keep it private>
STUN_HOST=<host coturn yourself or use a public STUN server>
RECAPTCHA_PUBLIC_KEY=<recaptcha public key for matrix>
RECAPTCHA_PRIVATE_KEY=<recaptcha private key for matrix>
TURN_SHARED_SECRET=<turn shared secret>
TURN_URI=turn:xxx.xxxx.xxx:3478?transport=udp
```

If you do not want to run coturn yourself, you can use the project ghost STUN server as follows:

```
STUN_HOST=stun.pyrosec.gg:3478
TURN_URI=turn:stun.pyrosec.gg:3478?transport=udp
TURN_SHARED_SECRET=projectghostisalmostfree
```

Run the script:

```sh
bash ghostdial/scripts/init.sh
```

This creates the file hierarchy for the persistent ghostdial files.

Lastly, put your serviceaccount.json into ghostdb/gcloud/serviceaccount.json

Then, start project ghost:

```sh
cd ghostdial
docker-compose up -d
```

Check out the file hierarchy created by the program run to familiarize yourself. Some notable filepaths would be

- ghostdb/asterisk/  (contains the exported asterisk configurations, which can be changed arbitrarily to suit your team's needs)
- ghostdb/prosody/ (contains prosody databases)
- ghostdb/sms_pipeline/ (contains SMS databases)
- ghostdb/logs/ (contains all logs)
- ghostdb/spool/asterisk (contains recordings of all calls made with project ghost)
- ghostdb/letsencrypt/ (contains SSL certificates)
- ghostdb/www-data/ (contains webroot for static assets you want to serve from https://<domain>/)
- ghostdb/synapse/ (contains matrix server database)
- ghostdb/vaultwarden/ (contains encrypted data associated with password manager accounts on the vaultwarden instance)
- ghostdb/redis/ (contains the redis database)
- ghostdb/postgres/ (contains the postgres database used for matrix-synapse)

## Running project-ghost behind NAT

To run project-ghost on your home server, you just have to port forward the following TCP ports:

- 35061
- 443
- 80
- 5222
- 5223
- 5347
- 5269
- 5280
- 5281

You must also port forward the UDP port range 30000-30099

## Piloting your deployment

If your domain is `myghostserver.is` then you can use Conversations or any XMPP client to message dossi@myghostserver.is from an XMPP account you create on myghostserver.is.

You can then register as an admin and provision yourself a 3 digit extension with a command such as:

```
register 123
```

At this point, you will receive a SIP password and PIN for the extension from dossi that you can use to log in via your SIP client (Groundwire on mobile or linphone on desktop)

Others can register a SIP account as well on your server in this same way, and reach each other on their SIP client by dialing the 3 digit extension they provision themselves.

To provision yourself DIDs against the voip.ms server, first search for what is available by messaging dossi:

```sh
searchdids type:starts query:757 state:VA
```

Then, if you see a number you like, get it!

```sh
orderdid 7576255330
```

Now you can create an XMPP account on your server 7576255330@myghostserver.is and start receiving SMS/MMS/voicemail.

The first number you provision becomes the default for your extension. But at any time this can be updated in redis via the key `didfor.123`. There has to be a value set for this key, likewise for `extfor.7576255330` should be set to `123` for inbound calls to ring your phone.

You can configure the PSTN phone number to your actual cell phone by setting the `fallback.123` key to the phone number (no country code) that you want to ring if your SIP phone doesn't answer. Text fowarding can be set by setting `sms-fallback.123` to whatever phone number you want to receive texts over the normal phone network.

The best thing to do, however, is to port the phone number that you use on your phone to your voip.ms account, then configure that phone number on the voip.ms system to ring your SIP subaccount on voip.ms such that your project ghost can handle it. You will have to explicitly enable SMS/MMS for that DID that you port in, since project ghost did not create it.

Once you do this, you can install Call Blocker Pro on Android to simply disable normal phone calls to your cell number. This way, your phone will get the benefit of the call firewall from project ghost, and screen all VoIP calls from spammers etc.

It is worth noting that project ghost will delete SMS/MMS off of the voip.ms servers as soon as they are relayed in or out. This is pretty helpful.

At any time, you can view the logs with

```sh
cd project-ghost
docker-compose logs --tail 100 -f
```

To see logs for just a single process in the stack, use

```sh
cd project-ghost
docker-compose logs -f --tail 100 asterisk
```

To operate on the redis database and configure extensions directly, without dossi, you can use

```sh
cd project-ghost
docker-compose exec redis redis-cli
```

And to operate the asterisk CLI, you can use

```sh
cd project-ghost
docker-compose exec asterisk asterisk -rvvv
```

### Dialing other project ghost deployments

If you have other intel teams you work closely with, it would be good to be able to give them a call via this switch.

First, you have to create a switch on your system that can be used. Message dossi with:

```sh
createpeer 1551
```

Or any 4 digit number for the switch.

dossi will respond with a command that the other project ghost administrator needs to send to his dossi, which should look like

```sh
registerpeer tls://1551:ac4b13b4b1n@myghostserver.is:35061
```

Once this is done, asterisk will reload its configuration, and that 4 digit number serves as a bridge between the two deployments. If the individual you want to dial on the opposite side of that bridge is extension 801, then you dial 1551801. Similarly, if your extension is 123, someone on the other end of the bridge can dial 1551123.

It is convenient to set custom extensions to folks you call often once your routing table is built for all the peer project ghost deployments you wish to dial extensions on.

### Using vaultwarden and synapse

Project ghost deploys a reverse proxy that combines vaultwarden, a self-hosted password manager compatible with the Bitwarden application and browser extension, as well as synapse, the matrix server implementation.

To use these, you can navigate directly to the domain you configured to access the vaultwarden instance. You will want to install the Bitwarden mobile app or browser extension, and prior to account creation/login, configure Region to Self-hosted then input `https://<your domain>` as the server URL. Then you get all the paid features of Bitwarden, including team password management and 2FA, for free.

Install Element Secure Messenger on desktop and mobile. Create an account using your server as the custom homeserver.

Message me at @reyes:matrix.pyrosec.is if you would like to speak to me.

## Author
Pyrosec Labs

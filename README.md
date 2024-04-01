# ghostdial

Ghostdial is the communications framework designed for project ghost, a project written by ghosts, for ghosts.

## Using ghostdial

If you've been onboarded to project ghost, then congratulations, ghost! Your life will now be exciting and action packed. You will need to set up ghostdial, to get started.

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

## Running a ghostdial server

Create an account at [https://voip.ms](https://voip.ms) and enable API usage for the IP address you will run project ghost from. You will need the API password in your project ghost .env file.

Create a SIP subaccount in the voip.ms UI and configure it such that voip.ms does not set callerid for you. You will need the password in your project ghost .env file.

Create a gcloud account and serviceaccount.json with full permissions.

Create a storage bucket on gcloud and record the name for it.

Create a Twilio trial account and record the SID / account key.

Ensure that docker and docker-compose are available on the system.

```sh
git clone https://github.com/ghostdial/ghostdial
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
PROJECT_GHOST_DATABASE=<path to directory where ghostdial files will live>
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

Run the script:

```sh
bash ghostdial/scripts/init.sh
```

This creates the file hierarchy for the persistent ghostdial files.

```sh
cd ghostdial
docker-compose build
docker-compose up certbot
docker-compose up -d
docker-compose up -d nginx
```

## Author
Ghostdial LLC

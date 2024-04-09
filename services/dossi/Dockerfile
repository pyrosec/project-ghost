FROM node:lts
WORKDIR /app
COPY . .
RUN yarn
RUN apt-get update && apt-get install -y python3 python3-pip git build-essential
WORKDIR /root
RUN bash -c 'git clone https://github.com/sherlock-project/sherlock; cd $HOME/sherlock; pip install -r requirements.txt --break-system-packages'
RUN bash -c 'git clone https://github.com/megadose/holehe; cd holehe; pip install -e . --break-system-packages'
RUN bash -c 'git clone https://github.com/iojw/socialscan; cd socialscan; pip install -e . --break-system-packages'
RUN bash -c 'git clone https://github.com/grabowskiadrian/WhatsMyName-Client; cd WhatsMyName-Client; pip install -r requirements.txt --break-system-packages'
WORKDIR /app
CMD ["yarn", "start"]

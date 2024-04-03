FROM node:lts
WORKDIR /app
COPY . .
RUN yarn
RUN apt-get update && apt-get install -y python3 python3-pip git
WORKDIR /root
RUN bash -c 'git clone https://github.com/sherlock-project/sherlock; cd $HOME/sherlock; pip install -r requirements.txt'
RUN bash -c 'git clone https://github.com/megadose/holehe; cd holehe; pip install -e .'
RUN bash -c 'git clone https://github.com/iojw/socialscan; cd socialscan; python3 setup.py install'
WORKDIR /app
CMD ["yarn", "start"]

FROM node:lts
WORKDIR /app
COPY package.json .
COPY yarn.lock .
RUN yarn
COPY lib ./lib
COPY bin ./bin
CMD ["yarn", "start"]

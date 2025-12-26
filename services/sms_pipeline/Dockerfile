FROM node:lts
WORKDIR /app
COPY . .
RUN yarn && yarn build
CMD ["yarn", "start"]

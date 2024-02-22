FROM debian:11.9
RUN apt update && apt install curl -y && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
RUN export NVM_DIR="$HOME/.nvm" ; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" ; nvm install v14.16.1
ENV PATH="$PATH:/root/.nvm/versions/node/v14.16.1/bin"
ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js and npm
RUN apk add --no-cache --update nodejs npm

# Set the working directory for the application code.
# This is a standard location and is not a persistent volume.
WORKDIR /app

# Copy package files to the app directory
COPY package*.json ./

# Install dependencies in the app directory
RUN npm install --only=production

# Copy the rest of your application files
COPY . .

# Copy the startup script and make it executable
COPY run.sh /
RUN chmod a+x /run.sh

ENV PROXY_PORT=9543
ENV API_ORIGIN="http://10.0.1.218:9543"

# Set the default command to run the script
CMD [ "/run.sh" ]
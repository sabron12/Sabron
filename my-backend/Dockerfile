# Use Node.js 18 LTS base image
FROM node:20

# Set working directory in container
WORKDIR /app

# Copy package.json and package-lock.json first (for efficient caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all other files (including server.js, uploads, database, etc.)
COPY . .

# Make sure uploads folder exists inside the container
RUN mkdir -p uploads

# Expose the port your app runs on (matches server.js -> port 4000)
EXPOSE 4000

# Start the server
CMD ["node", "server.js"]

FROM task-lifecycle-sandbox:latest

USER root

# Install PHP CLI and Composer
RUN apt-get update && apt-get install -y --no-install-recommends \
    php-cli \
    php-mbstring \
    php-xml \
    php-curl \
    php-sqlite3 \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

USER agent
WORKDIR /home/agent/workspace

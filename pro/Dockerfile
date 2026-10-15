# The Pro image: web and worker are this one image. It holds the code and the vendor folder only, no data, no
# secrets. The Lite core comes as the build context "lite" (see compose.yaml) because Pro autoloads ../lite/src.
FROM serversideup/php:8.3-fpm-nginx

# The mount points of the data and projects volumes; compose.yaml sets them.
ARG FORMGATE_DATA_DIR
ARG FORMGATE_PROJECTS_DIR

ENV NGINX_WEBROOT=/var/www/html/public

COPY --chown=www-data:www-data --from=lite src /var/www/lite/src
COPY --chown=www-data:www-data . /var/www/html
COPY docker/nginx-http.conf.template /etc/nginx/site-opts.d/http.conf.template

# The volumes start empty: their mount points belong to the user of the web and worker processes.
USER root
RUN mkdir -p "${FORMGATE_DATA_DIR:?}" "${FORMGATE_PROJECTS_DIR:?}" \
    && chown www-data:www-data "${FORMGATE_DATA_DIR:?}" "${FORMGATE_PROJECTS_DIR:?}"

USER www-data
RUN composer install --no-dev --optimize-autoloader --no-interaction

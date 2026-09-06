FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7

ENV DEBIAN_FRONTEND=noninteractive

ARG DEBIAN_MIRROR=https://mirrors.cloud.tencent.com
ARG PYPI_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple
ARG NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY}

RUN sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources && \
    apt-get -o Acquire::Retries=5 update && \
    apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
        bash ca-certificates curl fonts-noto-cjk git libreoffice-calc nodejs npm procps ripgrep xz-utils && \
    rm -rf /var/lib/apt/lists/* /tmp/*

WORKDIR /workspace

RUN pip install --no-cache-dir --retries 10 --timeout 120 --index-url "${PYPI_INDEX_URL}" \
        "pytest==8.3.4" \
        "openpyxl==3.1.5" \
        "pandas==2.2.3" \
        "pyyaml==6.0.2" \
        "pypdf==5.1.0" \
        "python-docx==1.1.2" \
        "python-pptx==1.0.2"

COPY workspace.tar.gz /tmp/workspace.tar.gz
RUN tar xzf /tmp/workspace.tar.gz -C /workspace && rm /tmp/workspace.tar.gz

RUN mkdir -p /workspace/output

RUN git config --global user.email "dev@project" && \
    git config --global user.name "Developer" && \
    git init -q -b main && git add -A && git commit -q -m "initial setup"

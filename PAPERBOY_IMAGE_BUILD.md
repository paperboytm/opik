# Paperboy Opik Image Build Runbook

This document is for the `paperboytm/opik` fork. Use it when Paperboy needs to
build and publish Opik application images from forked source code instead of
using upstream `ghcr.io/comet-ml/opik` images.

The Paperboy deployment expects these images to stay on the same tag:

```text
opik-backend
opik-python-backend
opik-frontend
opik-sandbox-executor-python
```

Registry:

```text
us-central1-docker.pkg.dev/gen-lang-client-0436525842/paperboy
```

## Tag Format

Use this format for production deployment tags:

```text
<opik-version>-paperboy-<source-short-sha>
```

Example:

```text
2.1.11-paperboy-d80c0bfb59b0
```

The GitHub workflow uses this format automatically when the `tag` input is
empty:

```bash
base_version="$(cat version.txt)"
short_sha="$(git rev-parse --short=12 HEAD)"
tag="${base_version}-paperboy-${short_sha}"
```

For production rollouts, pass the tag explicitly so Platform can pin the exact
same value in Helm values.

## One-Time GCP Setup

Cloud Build must be enabled in the Paperboy GCP project:

```bash
gcloud services enable cloudbuild.googleapis.com \
  --project=gen-lang-client-0436525842
```

The Cloud Build worker currently runs as:

```text
634173089960-compute@developer.gserviceaccount.com
```

Grant it read access to the Cloud Build source bucket:

```bash
gcloud storage buckets add-iam-policy-binding \
  gs://gen-lang-client-0436525842_cloudbuild \
  --member=serviceAccount:634173089960-compute@developer.gserviceaccount.com \
  --role=roles/storage.objectViewer
```

Grant it write access to the Paperboy Artifact Registry repository:

```bash
gcloud artifacts repositories add-iam-policy-binding paperboy \
  --location=us-central1 \
  --project=gen-lang-client-0436525842 \
  --member=serviceAccount:634173089960-compute@developer.gserviceaccount.com \
  --role=roles/artifactregistry.writer
```

Grant log writing so Cloud Build step logs are visible:

```bash
gcloud projects add-iam-policy-binding gen-lang-client-0436525842 \
  --member=serviceAccount:634173089960-compute@developer.gserviceaccount.com \
  --role=roles/logging.logWriter
```

## GitHub Actions Setup

The workflow is:

```text
.github/workflows/paperboy-build-images.yml
```

It does not build images on the GitHub runner. It only:

1. checks out the requested ref;
2. authenticates to GCP;
3. resolves the Paperboy image tag;
4. submits `cloudbuild.paperboy-images.yaml` to Cloud Build.

The workflow expects this secret:

```text
GCP_SA_KEY
```

Configure it either as a repository secret or under the `google-cloud-prod`
GitHub environment. If this secret or environment is missing, manual `gcloud
builds submit` still works, but GitHub workflow dispatch will fail.

## Manual Cloud Build

Run commands from the repository root.

Check the active GCP project and account:

```bash
gcloud config get-value project
gcloud auth list --filter=status:ACTIVE --format='value(account)'
```

Set the tag and registry:

```bash
TAG="2.1.11-paperboy-d80c0bfb59b0"
REGISTRY="us-central1-docker.pkg.dev/gen-lang-client-0436525842/paperboy"
```

Submit the build:

```bash
gcloud builds submit \
  --project=gen-lang-client-0436525842 \
  --config=cloudbuild.paperboy-images.yaml \
  --substitutions="_REGISTRY=${REGISTRY},_TAG=${TAG}" \
  --ignore-file=.gcloudignore.paperboy-images \
  .
```

The build config uses:

```yaml
options:
  machineType: E2_HIGHCPU_32
  diskSizeGb: 200
  logging: CLOUD_LOGGING_ONLY
```

Every Docker build step sets:

```text
DOCKER_BUILDKIT=1
```

BuildKit is required because the frontend Dockerfile uses `COPY --chmod`.

## What Cloud Build Does

`cloudbuild.paperboy-images.yaml` builds and pushes the images in this order:

1. Build `opik-sandbox-executor-python`.
2. Build `opik-backend`.
3. Build `opik-frontend`.
4. Push `opik-sandbox-executor-python`.
5. Save the sandbox executor image into
   `apps/opik-python-backend/opik-sandbox-executor-python.tar.gz`.
6. Build `opik-python-backend` with that tarball in its Docker context.
7. Push `opik-backend`.
8. Push `opik-frontend`.
9. Push `opik-python-backend`.

The sandbox executor tarball is not committed. It is generated inside the Cloud
Build worker for the python backend image build.

## Source Upload Check

The build uses a dedicated ignore file:

```text
.gcloudignore.paperboy-images
```

It keeps the upload small by excluding local caches such as:

```text
apps/opik-frontend/node_modules/
apps/opik-frontend/dist/
apps/opik-frontend/build/
apps/opik-python-backend/opik-sandbox-executor-python.tar.gz
```

To inspect what Cloud Build would upload:

```bash
if [[ -e .gcloudignore ]]; then
  echo ".gcloudignore already exists; inspect it before overwriting"
  exit 1
fi

cleanup() { rm -f .gcloudignore; }
trap cleanup EXIT

cp .gcloudignore.paperboy-images .gcloudignore
gcloud meta list-files-for-upload . > /tmp/opik-paperboy-upload-files.txt
wc -l /tmp/opik-paperboy-upload-files.txt
rg -n 'node_modules|opik-sandbox-executor-python.tar.gz|cloudbuild|opik-backend/Dockerfile|opik-frontend/Dockerfile|opik-python-backend/Dockerfile|opik-sandbox-executor-python/Dockerfile' \
  /tmp/opik-paperboy-upload-files.txt
```

Expected result:

- the four Dockerfiles and `cloudbuild.paperboy-images.yaml` are present;
- `node_modules` is absent;
- local sandbox executor tarballs are absent.

## Verify Pushed Images

After Cloud Build succeeds, verify every tag:

```bash
TAG="2.1.11-paperboy-d80c0bfb59b0"

for image in \
  opik-sandbox-executor-python \
  opik-backend \
  opik-python-backend \
  opik-frontend
do
  echo "${image}"
  gcloud artifacts docker tags list \
    "us-central1-docker.pkg.dev/gen-lang-client-0436525842/paperboy/${image}" \
    --project=gen-lang-client-0436525842 \
    --filter="tag:${TAG}" \
    --format='table(tag,version)'
done
```

For the verified `2.1.11-paperboy-d80c0bfb59b0` build, the digests were:

```text
opik-sandbox-executor-python  sha256:e0beed45de29f724fa67d12124538f5294f3a7b75fd98a726603b7bee667aa4a
opik-backend                  sha256:395cefa6e21b15efd470d9cb7809e121a9fedae8c647e0aac4631010f4f3a199
opik-python-backend           sha256:da561eeec69dcd2876e70d4dddd3191581389e2f1ad84be52fcd6e3c00c51725
opik-frontend                 sha256:2155a9c952749390727fa3986c1fe4b554696c57b441b215d5cab3e1ee5d58cc
```

Successful Cloud Build example:

```text
b2676833-d39f-467b-a712-d89d36f754de
duration: 3m58s
```

## Deploy Through Platform

Platform pins the Paperboy images in:

```text
gke/k8s/opik/values.yaml
```

The important fields are:

```yaml
registry: us-central1-docker.pkg.dev/gen-lang-client-0436525842/paperboy

component:
  backend:
    image:
      repository: opik-backend
      tag: <paperboy-tag>

  python-backend:
    image:
      repository: opik-python-backend
      tag: <paperboy-tag>
    env:
      PYTHON_CODE_EXECUTOR_IMAGE_REGISTRY: us-central1-docker.pkg.dev/gen-lang-client-0436525842/paperboy
      PYTHON_CODE_EXECUTOR_IMAGE_TAG: <paperboy-tag>

  frontend:
    image:
      repository: opik-frontend
      tag: <paperboy-tag>
```

Before deploying, render the chart and confirm image refs:

```bash
helm template opik opik/opik \
  --namespace opik \
  --version 2.1.11 \
  --values gke/k8s/opik/values.yaml \
  >/tmp/opik-paperboy-rendered.yaml

rg -n 'image:|PYTHON_CODE_EXECUTOR_IMAGE_(REGISTRY|TAG)|opik-(backend|python-backend|frontend|sandbox)' \
  /tmp/opik-paperboy-rendered.yaml \
  -C 1
```

## Troubleshooting

### Cloud Build API disabled

Error:

```text
Cloud Build API has not been used in project ... before or it is disabled
```

Fix:

```bash
gcloud services enable cloudbuild.googleapis.com \
  --project=gen-lang-client-0436525842
```

### Source tarball permission denied

Error:

```text
storage.objects.get denied on ..._cloudbuild/source/...
```

Fix:

```bash
gcloud storage buckets add-iam-policy-binding \
  gs://gen-lang-client-0436525842_cloudbuild \
  --member=serviceAccount:634173089960-compute@developer.gserviceaccount.com \
  --role=roles/storage.objectViewer
```

### No Cloud Build step logs

Error:

```text
does not have permission to write logs to Cloud Logging
```

Fix:

```bash
gcloud projects add-iam-policy-binding gen-lang-client-0436525842 \
  --member=serviceAccount:634173089960-compute@developer.gserviceaccount.com \
  --role=roles/logging.logWriter
```

### Artifact Registry push denied

Fix:

```bash
gcloud artifacts repositories add-iam-policy-binding paperboy \
  --location=us-central1 \
  --project=gen-lang-client-0436525842 \
  --member=serviceAccount:634173089960-compute@developer.gserviceaccount.com \
  --role=roles/artifactregistry.writer
```

### Frontend fails on `COPY --chmod`

Error:

```text
the --chmod option requires BuildKit
```

Fix:

Ensure every Cloud Build `docker build` step has:

```yaml
env:
  - DOCKER_BUILDKIT=1
```

### Local Mac pulls the wrong architecture

If you build `linux/amd64` images from macOS and then run `docker pull` without
a platform, Docker may try to pull `linux/arm64` and fail:

```text
no matching manifest for linux/arm64/v8
```

Prefer Cloud Build for production images. If debugging locally, use:

```bash
docker pull --platform linux/amd64 "${REGISTRY}/opik-sandbox-executor-python:${TAG}"
```

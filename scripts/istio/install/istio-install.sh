#!/bin/bash

echo "Installing Istio with Ingress Gateway (NLB)"
export ISTIO_VERSION="1.14.1"

curl -L https://istio.io/downloadIstio | sh -
cd istio-${ISTIO_VERSION}
bin/istioctl version
sudo cp -v bin/istioctl /usr/local/bin/

istioctl install -y \
  --set profile=demo \
  --set components.egressGateways[0].name=istio-egressgateway \
  --set components.egressGateways[0].enabled=false \
  --set "values.gateways.istio-ingressgateway.serviceAnnotations.service\.beta\.kubernetes\.io/aws-load-balancer-type"='nlb' \
  --set "values.gateways.istio-ingressgateway.serviceAnnotations.service\.beta\.kubernetes\.io/aws-load-balancer-proxy-protocol"='*'

cd ..

export ELBURL=$(kubectl -n istio-system \
         get svc istio-ingressgateway \
         -o=jsonpath='{.status.loadBalancer.ingress[0].hostname}')

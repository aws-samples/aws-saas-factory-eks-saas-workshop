# Getting started

Export the right variables:

```bash
export CLUSTER_NAME=$(aws eks list-clusters --region ${AWS_REGION} --query clusters --output text)
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

```

Create an IRSA account for the EBS CSI:

```bash
eksctl create iamserviceaccount \
  --region us-west-2 \
  --name ebs-csi-controller-sa \
  --namespace kube-system \
  --cluster $CLUSTER_NAME \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
  --approve \
  --role-only \
  --role-name AmazonEKS_EBS_CSI_DriverRole
```

Create the EBS CSI Driver Addon
```bash
eksctl create addon \
  --name aws-ebs-csi-driver \
  --cluster eksworkshop-eksctl \
  --service-account-role-arn arn:aws:iam::$ACCOUNT_ID:role/AmazonEKS_EBS_CSI_DriverRole \
  --force
```

Install Prometheus:

```bash
kubectl create namespace prometheus

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

helm install prometheus prometheus-community/prometheus \
    --namespace prometheus \
    --set alertmanager.persistentVolume.storageClass="gp2" \
    --set server.persistentVolume.storageClass="gp2"
```

Make sure they're all up and running, particularly the `prometheus-server`.

```bash
kubectl get all -n prometheus
```

You can make sure that everything is being scraped correctly, by forwarding the prometheus web page to Cloud9's "Local Running App". It expects the app to show up on port 8080, so just forward prometheus from it's default port, 9090, to 8080:

```bash
kubectl port-forward -n prometheus deploy/prometheus-server 8080:9090
```

Then open `Tools / Preview / Preview Running Application` in Cloud9. Replace the last part of the URL with `/targets`.


Assuming Prometheus is set up, let's set up Grafana. Create a values file for the Helm chart

```bash
mkdir ${HOME}/environment/grafana

cat << EoF > ${HOME}/environment/grafana/grafana.yaml
datasources:
  datasources.yaml:
    apiVersion: 1
    datasources:
    - name: Prometheus
      type: prometheus
      url: http://prometheus-server.prometheus.svc.cluster.local
      access: proxy
      isDefault: true
EoF
```

Now we'll install the helm chart:

```bash
kubectl create namespace grafana

helm repo add grafana https://grafana.github.io/helm-charts

helm install grafana grafana/grafana \
    --namespace grafana \
    --set persistence.storageClassName="gp2" \
    --set persistence.enabled=true \
    --set adminPassword='Admin123*' \
    --values ${HOME}/environment/grafana/grafana.yaml \
    --set service.type=LoadBalancer
```

Wait for the new LB to spin up then use this to get the grafana URL:
```bash
export GRAFANA_URL=$(kubectl get svc -n grafana grafana -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "http://$GRAFANA_URL"
```

Login should be `admin/Admin123*`

# Install Artillery - Need to rethink Artillery because there is a bit of a delay
# to start pushing load. The simple wget in a loop seems to be a better fit and
# we can see the scaling behavior right away
#```bash
#npm install -g artillery@latest
#artillery run performance/artillery-config.yaml
#```

Deploy the metrics server

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

Verify status of metrics server - This needs some lead time, and cAn take a few minutes to show all Passed status.
Move this to setup or a place where we ask the attendee to read instruction.
This will be deployed by then
```bash
kubectl get apiservice v1beta1.metrics.k8s.io -o json | jq '.status'
```

Create HPA for Product service
Product service has the resource limits set for both CPU and Memory
```bash
kubectl autoscale deployment product -n pooled `#The target average CPU utilization` \
    --cpu-percent=20 \
    --min=1 `#The lower limit for the number of pods that can be set by the autoscaler` \
    --max=5 `#The upper limit for the number of pods that can be set by the autoscaler`
```

Verify HPA status
```bash
	kubectl get hpa -n pooled
```

Generate load
```bash
	kubectl run -i --tty load-generator --image=busybox /bin/sh
```

From the bash shell, execute a loop to call the health endpoint of the Product service
```bash
	while true; do wget -q -O - --timeout=2 http://product-service.pooled/app/api/products/health; done
```

Switch terminals. Watch HPA now
```bash
kubectl get hpa -n workshop -w
```
You will start seeing pods being added to handle all the load

Goto Grafana. and check the dashboard. Select the pooled namespace.
You will see the number of pods increase and you will notice spike in both CPU and memory
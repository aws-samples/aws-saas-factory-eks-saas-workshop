/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import * as eks from 'aws-cdk-lib/aws-eks';
import { Stack, StackProps, CfnOutput, NestedStackProps, NestedStack } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface HelmChartStackProps extends NestedStackProps {
  cluster: eks.Cluster;
}
export class HelmChartStack extends NestedStack {
  elbUrl: string;
  istioIngressGateway: string;
  constructor(scope: Construct, id: string, props: HelmChartStackProps) {
    super(scope, id, props);

    const cluster = props.cluster;
    const ingressControllerReleaseName = 'istio-ingress';
    const istioHelmRepo = 'https://istio-release.storage.googleapis.com/charts';
    const istioVersion = '1.19';
    const istioSystemNamespaceName = 'istio-system';
    const istioIngressNamespaceName = 'istio-ingress';
    const ingressGatewayName = 'gateway';

    this.istioIngressGateway = `${istioIngressNamespaceName}/${ingressGatewayName}`;

    const istioSystemNamespace = cluster.addManifest('my-istio-system-namespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: istioSystemNamespaceName },
    });

    const istioIngressNamespace = cluster.addManifest('my-istio-ingress-namespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: istioIngressNamespaceName,
        labels: { 'istio-injection': 'enabled' },
      },
    });

    const istioBase = cluster.addHelmChart('istio-base', {
      release: 'istio-base',
      namespace: istioSystemNamespaceName,
      chart: 'base',
      version: istioVersion,
      repository: istioHelmRepo,
    });

    istioBase.node.addDependency(istioSystemNamespace);

    const istiod = cluster.addHelmChart('istiod', {
      release: 'istiod',
      namespace: istioSystemNamespaceName,
      chart: 'istiod',
      version: istioVersion,
      repository: istioHelmRepo,
    });

    istiod.node.addDependency(istioSystemNamespace);
    istiod.node.addDependency(istioBase);

    const istioIngress = cluster.addHelmChart('istio-ingress', {
      release: 'istio-ingress',
      namespace: istioIngressNamespaceName,
      chart: 'gateway',
      version: istioVersion,
      repository: istioHelmRepo,
      values: {
        service: {
          annotations: {
            'service.beta.kubernetes.io/aws-load-balancer-healthcheck-path': '/health',
            'service.beta.kubernetes.io/aws-load-balancer-type': 'nlb',
            'service.beta.kubernetes.io/aws-load-balancer-proxy-protocol': '*',
          },
        },
      },
    });

    istioIngress.node.addDependency(istioIngressNamespace);
    istioIngress.node.addDependency(istioBase);
    istioIngress.node.addDependency(istiod);

    const albAddress = new eks.KubernetesObjectValue(this, 'elbAddress', {
      cluster,
      objectType: 'Service',
      objectName: ingressControllerReleaseName,
      jsonPath: '.status.loadBalancer.ingress[0].hostname',
      objectNamespace: 'istio-ingress',
    });

    this.elbUrl = albAddress.value;
    new CfnOutput(this, 'ELBURL', { value: albAddress.value });
  }
}

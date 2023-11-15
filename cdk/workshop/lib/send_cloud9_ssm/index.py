import boto3
import logging
from crhelper import CfnResource

helper = CfnResource()
logger = logging.getLogger(__name__)

try:
    # Init code goes here
    pass
except Exception as e:
    helper.init_failure(e)


def wait_for_instance(instance_id):
    client = boto3.client('ec2')
    logger.info(f'Waiting for instance {instance_id} to be ready')
    waiter = client.get_waiter('instance_status_ok')
    waiter.wait(InstanceIds=[instance_id])


def send_command(cluster_name, instance_id, instance_role_arn, region):
    client = boto3.client('ssm')
    logger.info(f'Sending command to instance {instance_id}')
    response = client.send_command(
        InstanceIds=[
            instance_id,
        ],
        DocumentName='AWS-RunShellScript',
        DocumentVersion='$LATEST',
        TimeoutSeconds=30,
        Comment='Updates the Cloud9 instance with all tools necessary to run the workshop',
        CloudWatchOutputConfig={
            'CloudWatchLogGroupName': 'cloud9-tools',
            'CloudWatchOutputEnabled': True,
        },
        Parameters={
            'commands': [
                'curl -sSL -o /tmp/kubectl https://amazon-eks.s3.us-west-2.amazonaws.com/1.21.2/2021-07-05/bin/linux/amd64/kubectl',
                'chmod +x /tmp/kubectl',
                'mv /tmp/kubectl /usr/local/bin/kubectl',
                f'su -l -c \'aws eks update-kubeconfig --name {cluster_name} --region {region} --role-arn {instance_role_arn}\' ec2-user',
                f'su -l -c \'echo "export AWS_DEFAULT_REGION={region}" >> ~/.bash_profile\' ec2-user',
                f'echo "export AWS_REGION={region}" >> ~/.bash_profile\' ec2-user',
                'curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp',
                'chmod +x /tmp/eksctl',
                'mv /tmp/eksctl /usr/local/bin',
                'yum -y install jq gettext bash-completion moreutils',
                '/usr/local/bin/kubectl completion bash > /etc/bash_completion.d/kubectl',
                '/usr/local/bin/eksctl completion bash > /etc/bash_completion.d/eksctl',
                'su -l -c \'echo "alias k=kubectl" >> ~/.bash_profile\' ec2-user',
                'su -l -c \'echo "complete -F __start_kubectl k" >> ~/.bash_profile\' ec2-user',
                'curl -fsSL -o /tmp/helm.tgz https://get.helm.sh/helm-v3.7.1-linux-amd64.tar.gz',
                'tar -C /tmp -xzf /tmp/helm.tgz',
                'mv /tmp/linux-amd64/helm /usr/local/bin/helm',
                'rm -rf /tmp/helm.tgz /tmp/linux-amd64',
                f'volume_id=$(aws --region {region} ec2 describe-volumes --filters Name=attachment.instance-id,Values={instance_id} --query \'Volumes[0].VolumeId\' --output text)',
                f'aws --region {region} ec2 modify-volume --volume-id $volume_id --size 30`',
                'reboot',
            ],
        },
    )
    commandId = response['Command']['CommandId']
    logger.info(f'Waiting for command {commandId} to complete')
    client.get_waiter('command_executed').wait(
        CommandId=commandId, InstanceId=instance_id)

    helper.Data['commandId'] = commandId


@helper.create
@helper.update
def do_action(event, _):
    try:
        cluster_name = event['ResourceProperties']['clusterName']
        if not cluster_name:
            raise Exception('ClusterName is required')
        region = event['ResourceProperties']['region']
        if not region:
            raise Exception('Region is required')
        instance_id = event['ResourceProperties']['instanceId']
        if not instance_id:
            raise Exception('InstanceId is required')
        instance_role_arn = event['ResourceProperties']['instanceRoleArn']
        if not instance_role_arn:
            raise Exception('InstanceRoleArn is required')

        wait_for_instance(instance_id)
        send_command(cluster_name, instance_id, instance_role_arn, region)

    except Exception as e:
        helper.init_failure(e)
    return helper.PhysicalResourceId


@helper.delete
def do_nothing(_, __):
    pass


def lambda_handler(event, context):
    logger.debug(f'Event: {event}')
    helper(event, context)

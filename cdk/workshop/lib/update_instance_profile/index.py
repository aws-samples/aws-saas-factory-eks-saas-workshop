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


def update_instance_profile(instance_id, instance_profile_arn):
    client = boto3.client('ec2')

    instanceProfileAssociations = {}
    response = client.describe_iam_instance_profile_associations(
        Filters=[
            {
                'Name': 'instance-id',
                'Values': [instance_id]
            },
        ],
    )
    instanceProfileAssociations = response['IamInstanceProfileAssociations']
    logger.debug(f'instanceProfileAssociations: {instanceProfileAssociations}')
    if len(instanceProfileAssociations) == 1:
        associationId = instanceProfileAssociations[0]['AssociationId']
        if associationId:
            client.replace_iam_instance_profile_association(
                IamInstanceProfile={
                    'Arn': instance_profile_arn,
                },
                AssociationId=associationId
            )
    else:
        client.associate_iam_instance_profile(
            IamInstanceProfile={
                'Arn': instance_profile_arn,
            },
            InstanceId=instance_id
        )


def get_environment_id(environment_name):
    client = boto3.client('cloud9')
    response = client.list_environments()
    env_response = client.describe_environments(
        environmentIds=response['environmentIds'])
    envs = env_response['environments']
    for env in envs:
        if env['name'] == environment_name:
            return env['id']
    return None


def get_instance_id(environment_id):
    client = boto3.client('ec2')
    if not environment_id:
        return None
    response = client.describe_instances(
        Filters=[{'Name': 'tag:aws:cloud9:environment',
                  'Values': [environment_id]}]
    )
    return response['Reservations'][0]['Instances'][0]['InstanceId']


@helper.create
@helper.update
def do_action(event, _):
    try:
        instance_profile_arn = event['ResourceProperties']['InstanceProfileArn']

        environment_name = event['ResourceProperties']['EnvironmentName']
        environment_id = get_environment_id(environment_name)
        if not environment_id:
            raise Exception('Environment not found')
        logger.debug(f'environment_id: {environment_id}')

        instance_id = get_instance_id(environment_id)
        if not instance_id:
            raise Exception('Instance not found')
        logger.debug(f'instance_id: {instance_id}')

        update_instance_profile(instance_id, instance_profile_arn)
        helper.Data['InstanceId'] = instance_id
    except Exception as e:
        helper.init_failure(e)
    return helper.PhysicalResourceId


@helper.delete
def do_nothing(_, __):
    pass


def lambda_handler(event, context):
    logger.debug(f'Event: {event}')
    helper(event, context)

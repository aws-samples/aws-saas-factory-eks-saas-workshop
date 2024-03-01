# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import boto3
import json
import time

ec2_client = boto3.client("ec2")
cloud9_client = boto3.client("cloud9")
iam_client = boto3.client("iam")


def _create_cloud9_ssm_role(role_name):
    role_path = "/service-role/"
    assume_role_policy_document = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": ["ec2.amazonaws.com", "cloud9.amazonaws.com"]
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }

    # The role does not exist, so create it
    iam_client.create_role(
        RoleName=role_name,
        AssumeRolePolicyDocument=json.dumps(assume_role_policy_document),
        Path=role_path
    )


def _create_cloud9_iam_resources_if_necessary():
    # Check if the IAM role already exists
    role_name = "AWSCloud9SSMAccessRole"
    try:
        iam_client.get_role(RoleName=role_name)
        print(f"{role_name} role already exists")
    except iam_client.exceptions.NoSuchEntityException:
        print(f"{role_name} does not exist. Creating...")
        _create_cloud9_ssm_role(role_name)

    # Define the policy ARN
    policy_arn = "arn:aws:iam::aws:policy/AWSCloud9SSMInstanceProfile"

    # Check if the policy is already attached to the IAM role
    attached_policies = iam_client.list_attached_role_policies(
        RoleName=role_name)
    attached_policy_arns = [policy["PolicyArn"]
                            for policy in attached_policies["AttachedPolicies"]]
    if policy_arn not in attached_policy_arns:
        # The policy is not attached, so attach it
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn=policy_arn
        )

    # Define the instance profile name and path
    instance_profile_name = "AWSCloud9SSMInstanceProfile"
    instance_profile_path = "/cloud9/"

    # Check if the instance profile already exists
    try:
        iam_client.get_instance_profile(
            InstanceProfileName=instance_profile_name)
        print(f"{instance_profile_name} instance profile already exists")
    except iam_client.exceptions.NoSuchEntityException:
        print(f"{instance_profile_name} does not exist. Creating...")
        # The instance profile does not exist, so create it
        iam_client.create_instance_profile(
            InstanceProfileName=instance_profile_name,
            Path=instance_profile_path
        )

    # Check if the IAM role is already added to the instance profile
    instance_profile = iam_client.get_instance_profile(
        InstanceProfileName=instance_profile_name)
    instance_profile_roles = instance_profile["InstanceProfile"]["Roles"]
    instance_profile_role_names = [role["RoleName"]
                                   for role in instance_profile_roles]
    if role_name not in instance_profile_role_names:
        print(f"{role_name} is not added to {instance_profile_name}. Adding...")
        # The IAM role is not added to the instance profile, so add it
        iam_client.add_role_to_instance_profile(
            InstanceProfileName=instance_profile_name,
            RoleName=role_name
        )
    else:
        print(f"{role_name} is already added to {instance_profile_name}")


def on_event(event, context):
    print(event)
    request_type = event["RequestType"]
    if request_type == "Create":
        return on_create(event)
    if request_type == "Update":
        return on_update(event)
    if request_type == "Delete":
        return on_delete(event)
    raise Exception("Invalid request type: %s" % request_type)


def on_create(event):
    props = event["ResourceProperties"]
    c9_name = props["name"]
    new_instance_profile_name = props["instanceProfileName"]
    instance_tag_key = props["instanceTagKey"]
    instance_tag_value = props["instanceTagValue"]
    instance_id_data_name = props["instanceIdDataName"]
    env_id_data_name = props["envIdDataName"]
    member_arn = props.get("memberArn")
    connection_type = props.get("connectionType")
    instance_types = props.get("instanceTypes")
    image_id = props.get("imageId")

    # create AWSCloud9SSMAccessRole and resources if necessary
    _create_cloud9_iam_resources_if_necessary()

    c9_created = False
    for instance_type in instance_types:
        try:
            print(
                f"attempting to create cloud9 environment using {instance_type}")
            create_environment_ec2_response = cloud9_client.create_environment_ec2(
                instanceType=instance_type,
                connectionType=connection_type,
                imageId=image_id,
                description="Cloud9 Instance for EKS SaaS Workshop",
                name=c9_name,
                automaticStopTimeMinutes=120,
                tags=[
                    {
                        "Key": instance_tag_key,
                        "Value": instance_tag_value
                    },
                ],
                # ownerArn -> set to lambda role. This is so we can update the c9 environment
            )
            print(f"created cloud9 environment using {instance_type}")
            c9_created = True
            break
        except cloud9_client.exceptions.ConflictException as e:
            print(e)
            print(f"failed to create cloud9 environment using {instance_type}")

    if c9_created == False:
        raise Exception("Unable to create cloud9 environment.")

    print(create_environment_ec2_response)
    cloud9_environment_id = create_environment_ec2_response["environmentId"]
    if (member_arn):
        cloud9_response = cloud9_client.create_environment_membership(
            environmentId=cloud9_environment_id,
            userArn=member_arn,
            permissions="read-write"
        )
        print(cloud9_response)
    else:
        print("memberArn not set. Skipping add cloud9 member.")

    while True:
        time.sleep(30)
        describe_environment_status_response = cloud9_client.describe_environment_status(
            environmentId=cloud9_environment_id
        )
        print(describe_environment_status_response)
        if describe_environment_status_response.get("status") == "ready":
            break

    cloud9_update_env_response = cloud9_client.update_environment(
        environmentId=cloud9_environment_id,
        managedCredentialsAction="DISABLE"
    )
    print(cloud9_update_env_response)

    response = ec2_client.describe_instances(
        Filters=[
            {
                "Name": f"tag:{instance_tag_key}",
                "Values": [instance_tag_value],
            },
            {
                "Name": "instance-state-name",
                "Values": ["running"],
            },
        ],
    )

    if "Reservations" in response and len(response["Reservations"]) > 0:
        for instance in response["Reservations"][0]["Instances"]:
            instance_id = instance["InstanceId"]
            print(f"updating instance: {instance_id}")
            response = ec2_client.describe_iam_instance_profile_associations(
                Filters=[
                    {
                        "Name": "instance-id",
                        "Values": [instance_id],
                    },
                ],
            )

            if "IamInstanceProfileAssociations" in response and len(response["IamInstanceProfileAssociations"]) > 0:
                current_association_id = response["IamInstanceProfileAssociations"][0]["AssociationId"]

                print(
                    f"updating instance: {instance_id} with profile: {new_instance_profile_name}")
                ec2_client.replace_iam_instance_profile_association(
                    AssociationId=current_association_id,
                    IamInstanceProfile={
                        "Name": new_instance_profile_name,
                    },
                )

                print("Rebooting the instance...")
                ec2_client.reboot_instances(InstanceIds=[instance_id])

            return {
                "PhysicalResourceId": cloud9_environment_id,
                "Data": {
                    "status": f"successfully deployed physical_id: {cloud9_environment_id}",
                    instance_id_data_name: instance_id,
                    env_id_data_name: cloud9_environment_id,
                }
            }
        else:
            raise Exception(
                "Instance profile association not found for the instance")
    else:
        raise Exception("Instance not found with the specified tag")


def on_update(event):
    physical_id = event["PhysicalResourceId"]
    print("update resource %s" % (physical_id))
    # for updates, we delete and rebuild to avoid resource conflicts
    on_delete(event)
    return on_create(event)


def on_delete(event):
    physical_id = event["PhysicalResourceId"]
    try:
        cloud9_client.delete_environment(
            environmentId=physical_id
        )
        print(f"deleting physical_id: {physical_id}")
    except cloud9_client.exceptions.NotFoundException as e:
        print(f"caught error: {e}")
        return {"Data": {"status": f"physical_id: {physical_id} not found."}}

    try:
        while True:
            time.sleep(30)
            describe_environment_status_response = cloud9_client.describe_environment_status(
                environmentId=physical_id
            )
            print(describe_environment_status_response)
            if describe_environment_status_response.get("status") != "deleting":
                break
    except cloud9_client.exceptions.NotFoundException as e:
        print(f"caught error: {e}")
        print(f"environmentId: {physical_id} not found.")
    return {"Data": {"status": f"successfully deleted physical_id: {physical_id}"}}

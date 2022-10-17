import type { OnEventRequest, OnEventResponse } from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import { EC2 } from 'aws-sdk';

export async function onEventHandler(event: OnEventRequest): Promise<OnEventResponse> {
    console.log(JSON.stringify(event, null, 4));

    const ec2 = new EC2();

    if (event.RequestType === 'Create') {
        const { IamInstanceProfileAssociations } = await ec2.describeIamInstanceProfileAssociations({
            Filters: [
                {
                    Name: 'instance-id',
                    Values: [event.ResourceProperties.InstanceId]
                }
            ]
        }).promise();

        console.log(JSON.stringify(IamInstanceProfileAssociations, null, 4));

        if (IamInstanceProfileAssociations?.length == 1) {
            const associationId = IamInstanceProfileAssociations[0].AssociationId;
            if (associationId) {
                await ec2.replaceIamInstanceProfileAssociation({
                    IamInstanceProfile: {
                        Arn: event.ResourceProperties.InstanceProfileArn
                    },
                    AssociationId: associationId
                }).promise();
            }
        } else {
            await ec2.associateIamInstanceProfile({
                IamInstanceProfile: {
                    Arn: event.ResourceProperties.InstanceProfileArn
                },
                InstanceId: event.ResourceProperties.InstanceId
            }).promise();
        }
    }
    return {
        PhysicalResourceId: '',
    }
}
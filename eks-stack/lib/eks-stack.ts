import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Cloud9Resources } from "./cloud9-resources";

export class EksStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const participantAssumedRoleArn = process.env.PARTICIPANT_ASSUMED_ROLE_ARN;
    const workshopSSMPrefix = "/workshop";
    const cloud9ConnectionType = "CONNECT_SSM";
    const cloud9InstanceTypes = ["m5.large", "m4.large"];
    const cloud9ImageId = "amazonlinux-2023-x86_64";

    new Cloud9Resources(this, "Cloud9Resources", {
      createCloud9Instance: true,
      workshopSSMPrefix: workshopSSMPrefix,
      cloud9MemberArn: participantAssumedRoleArn,
      cloud9ConnectionType: cloud9ConnectionType,
      cloud9InstanceTypes: cloud9InstanceTypes,
      cloud9ImageId: cloud9ImageId,
    });
  }
}

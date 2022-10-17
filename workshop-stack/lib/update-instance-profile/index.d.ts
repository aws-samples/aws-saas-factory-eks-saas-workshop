import type { OnEventRequest, OnEventResponse } from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
export declare function onEventHandler(event: OnEventRequest): Promise<OnEventResponse>;

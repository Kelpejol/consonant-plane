/**
 * src/proto/planner.ts
 * 
 * gRPC Client for the Python Planner Service.
 * Uses dynamic proto loading to communicate with the Planner.
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to proto file
// consonant/plane/src/proto -> consonant/proto/...
// ../../../ goes to consonant root
console.log('DEBUG [client.ts]: __dirname =', __dirname);
const PROTO_PATH = path.resolve(__dirname, '../../../proto/consonant-grpc-proto/proto/v1/planner.proto');
const PROTO_DIR = path.dirname(PROTO_PATH);
console.log('DEBUG [client.ts]: PROTO_PATH =', PROTO_PATH);

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_DIR]
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const plannerPackage = protoDescriptor.terra.planner.v1;

// Service address (should be env var)
const PLANNER_ADDRESS = process.env.PLANNER_ADDRESS || 'localhost:50051';

// Client definition
export interface PlanStep {
    id: string;
    description: string;
    agent_selector: string;
    dependencies: string[];
}

export interface GeneratePlanResponse {
    steps: PlanStep[];
    reasoning: string;
}

export class PlannerClient {
    private client: any;

    constructor() {
        this.client = new plannerPackage.PlannerService(
            PLANNER_ADDRESS,
            grpc.credentials.createInsecure()
        );
    }

    async generatePlan(
        goal: string,
        workflowId: string,
        context: Record<string, string> = {}
    ): Promise<GeneratePlanResponse> {
        return new Promise((resolve, reject) => {
            logger.info(
                { workflowId, goal: goal.substring(0, 50) },
                'Requesting plan from Planner Service'
            );

            this.client.GeneratePlan(
                { goal, workflow_id: workflowId, context },
                (error: Error | null, response: GeneratePlanResponse) => {
                    if (error) {
                        logger.error(
                            { workflowId, error: error.message },
                            'Failed to generate plan'
                        );
                        reject(error);
                    } else {
                        logger.info(
                            { workflowId, stepCount: response.steps.length },
                            'Plan received from Planner Service'
                        );
                        resolve(response);
                    }
                }
            );
        });
    }
}

export const plannerClient = new PlannerClient();

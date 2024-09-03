import AWS from 'aws-sdk';
import qs from 'querystring';
import https from 'https';

const ec2 = new AWS.EC2();
const ecs = new AWS.ECS();

const userRoles = {
    'er.gauravds': 'senior',
    'shivam.kumar': 'senior',
    'satyam.choksey': 'senior',
    'saurabh.singh': 'senior',
    'sujoy.gaur': 'senior',
    'sonuy0199': 'senior',
    'abhay.faldu': 'senior',

};

const rolePermissions = {
    'intern': {
        'ec2': ['branch-server1', 'branch-server2'],
        'ecs': []
    },
    'medium': {
        'ec2': ['dev-server1', 'dev-server2'],
        'ecs': ['staging-cluster']
    },
    'senior': {
        'ec2': ['dev-qa-servers', 'branch-server2'],
        'ecs': ['webledger-office-production', 'webledger-books-production', 'webledger-office-staging', 'webledger-auth-production', 'webledger-books-staging', 'webledger-books-staging-ec2']
    }
};

export const handler = async (event) => {
    const body = qs.parse(event.body);
    const command = body.command;
    const instanceOrServiceName = body.text ? body.text.trim() : ''; // Safely handle undefined text
    const responseUrl = body.response_url;
    const channelName = body.channel_name;
    const userName = body.user_name;
    let message;

    console.log('Incoming Slack username:', userName);
    console.log('Response URL:', responseUrl);

    if (!responseUrl || typeof responseUrl !== 'string') {
        console.error('Invalid or missing response URL:', responseUrl);
        return {
            statusCode: 400,
            body: 'Invalid response URL provided.'
        };
    }

    if (channelName === 'devops') {
        const userRole = getUserRole(userName);

        if (!userRole) {
            message = `User @${userName} is not recognized.`;
        } else {
            if (command === '/start-ec2') {
                message = await startEC2InstancesByName(instanceOrServiceName, userName, userRole);
            } else if (command === '/stop-ec2') {
                message = await stopEC2InstancesByName(instanceOrServiceName, userName, userRole);
            } else if (command === '/start-ecs') {
                message = await startECSService(instanceOrServiceName, userName, userRole);
            } else if (command === '/stop-ecs') {
                message = await stopECSService(instanceOrServiceName, userName, userRole);
            } else {
                message = `Unknown command: ${command}`;
            }
        }
    } else {
        message = `The command is not allowed in this channel. Please use the #devops channel to start/stop services.`;
    }

    try {
        await sendSlackResponse(responseUrl, message);
    } catch (error) {
        console.error('Error sending Slack response:', error.message);
        return {
            statusCode: 500,
            body: `Error sending response to Slack: ${error.message}`
        };
    }

    return {
        statusCode: 200,
        body: '',
    };
};

const getUserRole = (userName) => {
    // console.log('Checking user role for:', userName);
    // for (const [role, users] of Object.entries(userRoles)) {
    //     if (users.includes(userName)) {
    //         return role;
    //     }
    // }
    // return null;
    return userRoles[userName]
};

const startEC2InstancesByName = async (name, userName, userRole) => {
    if (!rolePermissions[userRole].ec2.includes(name)) {
        return `User @${userName} is not authorized to start EC2 instances with the name "${name}".`;
    }

    const instances = await getInstancesByNameTag(name);
    if (instances.length === 0) {
        return `No EC2 instances found with the name: ${name}`;
    }

    const instanceIds = instances.map(instance => instance.InstanceId);
    const params = { InstanceIds: instanceIds };

    await ec2.startInstances(params).promise();
    return `User @${userName} is starting EC2 instances with name "${name}": ${instanceIds.join(', ')}`;
};

const stopEC2InstancesByName = async (name, userName, userRole) => {
    if (!rolePermissions[userRole].ec2.includes(name)) {
        return `User @${userName} is not authorized to stop EC2 instances with the name "${name}".`;
    }

    const instances = await getInstancesByNameTag(name);
    if (instances.length === 0) {
        return `No EC2 instances found with the name: ${name}`;
    }

    const instanceIds = instances.map(instance => instance.InstanceId);
    const params = { InstanceIds: instanceIds };

    await ec2.stopInstances(params).promise();
    return `User @${userName} is stopping EC2 instances with name "${name}": ${instanceIds.join(', ')}`;
};

const getInstancesByNameTag = async (name) => {
    const params = {
        Filters: [
            { Name: 'tag:Name', Values: [name] },
            { Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped'] }
        ]
    };

    const result = await ec2.describeInstances(params).promise();
    return result.Reservations.flatMap(reservation => reservation.Instances);
};

// Function to start an ECS service by cluster, service name, and optionally deploy a specific task definition revision
const startECSService = async (input, userName, userRole) => {
    const [clusterName, serviceName, taskDefinition] = input.split(' ');

    if (!rolePermissions[userRole].ecs.includes(clusterName)) {
        return `User @${userName} is not authorized to start or deploy the ECS service "${serviceName}" in cluster "${clusterName}".`;
    }

    const params = {
        cluster: clusterName,
        service: serviceName,
        desiredCount: 1,  // Adjust desired count as needed
        forceNewDeployment: true
    };

    // If a specific task definition is provided, use it
    if (taskDefinition) {
        params.taskDefinition = taskDefinition;
    }

    try {
        await ecs.updateService(params).promise();
        return `User @${userName} has successfully started and triggered a deployment of the ECS service "${serviceName}" in cluster "${clusterName}" using task definition "${taskDefinition || 'latest'}".`;
    } catch (error) {
        console.error(`Failed to start or deploy ECS service: ${error.message}`);
        return `Failed to start or deploy the ECS service "${serviceName}" in cluster "${clusterName}". Error: ${error.message}`;
    }
};

const stopECSService = async (input, userName, userRole) => {
    const [clusterName, serviceName] = input.split(' ');

    if (!rolePermissions[userRole].ecs.includes(clusterName)) {
        return `User @${userName} is not authorized to stop the ECS service "${serviceName}" in cluster "${clusterName}".`;
    }

    const params = {
        cluster: clusterName,
        service: serviceName,
        desiredCount: 0
    };
    await ecs.updateService(params).promise();
    return `User @${userName} is stopping ECS service "${serviceName}" in cluster "${clusterName}".`;
};

const sendSlackResponse = (responseUrl, message) => {
    return new Promise((resolve, reject) => {
        if (!responseUrl || typeof responseUrl !== 'string') {
            console.error('Invalid response URL provided:', responseUrl);
            return reject(new Error('Invalid response URL provided.'));
        }
        
        const data = JSON.stringify({ text: message });
        let url;

        try {
            url = new URL(responseUrl);
        } catch (error) {
            console.error('Failed to parse URL:', responseUrl);
            return reject(new Error('Failed to parse response URL.'));
        }

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length,
            },
        };

        const req = https.request(options, (res) => {
            if (res.statusCode === 200) {
                resolve();
            } else {
                reject(new Error(`Failed to send response to Slack: ${res.statusCode}`));
            }
        });

        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
};

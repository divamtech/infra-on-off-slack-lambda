# infra-ON-OFF-slackCommand-lambda
AWS services ON-OFF using slack commands
```
/start-ec2 < instance name or instance ID > -- for starting ec2 instance.
/stop-ec2 < instance name or isntance ID > -- for stoping ec2 instance.

/start-ecs <ecs-cluster-name> <ecs-service-name> -- if not mention any task defination it's use latest task.
/start-ecs <ecs-cluster-name> <ecs-service-name> <task-defination:tag> -- run service using specific task.
/stop-ecs <ecs-cluster-name> <ecs-service-name>

```

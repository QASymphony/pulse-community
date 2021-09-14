const PulseSdk = require("@qasymphony/pulse-sdk");
const request = require("request");
const xml2js = require("xml2js");

// DO NOT EDIT exported "handler" function is the entrypoint
exports.handler = async function ({ event, constants, triggers }, context, callback) {
    const standardHeaders = {
        "Content-Type": "application/json",
        Authorization: `bearer ${constants.QTEST_TOKEN}`,
    };
    const eventType = {
        CREATED: "workitem.created",
        UPDATED: "workitem.updated",
    };

    const workItemId = event.resource.workItemId;

    let requirementToUpdate = undefined;
    switch (event.eventType) {
        case eventType.CREATED:
            console.log(`[Info] Create workitem event received for 'WI${workItemId}'`);
            break;
        case eventType.UPDATED:
            console.log(`[Info] Update workitem event received for 'WI${workItemId}'`);
            const getReqResult = getRequirementByWorkItemId(workItemId);
            if (getReqResult.failed) {
                return;
            }
            requirementToUpdate = getReqResult.requirement;
            break;
        default:
            console.log(`[Error] Unknown workitem event type '${event.eventType}' for 'WI${workitemId}'`);
            return;
    }

    if (requirementToUpdate === undefined && !constants.AllowCreationOnUpdate) {
        console.log("[Info] Creation of Requirement on update event not enabled. Exiting.");
        return;
    }

    function getNamePrefix(workItemId) {
        return `WI${workItemId}:`;
    }

    function getRequirementByWorkItemId(workItemId) {
        const prefix = getNamePrefix(workItemId);
        const opts = {
            url: "https://" + constants.ManagerURL + "/api/v3/projects/" + constants.ProjectID + "/search",
            json: true,
            headers: standardHeaders,
            body: {
                object_type: "requirements",
                fields: ["*"],
                query: "Name ~ '" + prefix + "'",
            },
        };

        console.log(`[Info] Get existing requirement for 'WI${workItemId}'`);
        let failed = false;
        let requirement = undefined;
        request.post(opts, function (err, response, body) {
            if (err || !body) {
                console.log("[Error] Failed to get requirement by work item id.", err);
                failed = true;
            } else {
                if (body.total === 0) {
                    console.log("[Info] Requirement not found by work item id.");
                } else {
                    if (body.total === 1) {
                    } else {
                        console.log("[Warn] Multiple Requirements found by work item id.");
                        requirement = body.items[0];
                    }
                }
            }

            return { failed: failed, requirement: requirement };
        });
    }
};

const PulseSdk = require("@qasymphony/pulse-sdk");
const request = require("request");
const xml2js = require("xml2js");

// DO NOT EDIT exported "handler" function is the entrypoint
exports.handler = async function ({ event, constants, triggers }, context, callback) {
    const defectId = event.defect.id;
    console.log(`[Info] Create defect event received for '${defectId}'`);

    const defect = await getDefectById(event.defect.id);

    if (!defect) return;

    const summaryField = getField(defect, "Summary");
    const descriptionField = getField(defect, "Description");

    if (!summaryField || !descriptionField) {
        console.log("[Error] Fields not found, exiting.");
    }

    const summary = summaryField.field_value;
    const summaryFieldId = summaryField.field_id;
    console.log(`[Info] Defect summary: ${summary}`);
    const description = descriptionField.field_value;
    console.log(`[Info] Defect description: ${description}`);
    const link = defect.web_url;
    console.log(`[Info] Defect link: ${link}`);

    const bug = await createAzDoBug(defectId, summary, description, link);

    if (!bug) return;

    const workItemId = bug.id;
    const newSummary = `${getNamePrefix(workItemId)}${summary}`;
    console.log(`[Info] New defect name: ${newSummary}`);
    await updateDefectSummary(defectId, summaryFieldId, newSummary);

    function getNamePrefix(workItemId) {
        return `WI${workItemId}: `;
    }

    function getField(obj, fieldName) {
        if (!obj || !obj.properties) {
            console.log(`[Warn] Obj/properties not found.`);
            return;
        }
        const prop = obj.properties.find((p) => p.field_name === fieldName);
        if (!prop) {
            console.log(`[Warn] Property with field name '${fieldName}' not found.`);
            return;
        }

        return prop;
    }

    async function getDefectById(defectId) {
        const url = `https://${constants.ManagerURL}/api/v3/projects/${constants.ProjectID}/defects/${defectId}`;

        console.log(`[Info] Get defect details for '${defectId}'`);

        try {
            const response = await doqTestRequest(url, "GET", null);
            return response;
        } catch (error) {
            console.log("[Error] Failed to get defect by id.", error);
            failed = true;
        }

        return { failed: failed, requirement: requirement };
    }

    async function createAzDoBug(defectId, name, description, link) {
        console.log(`[Info] Creating bug in Azure DevOps '${defectId}'`);
        const url = encodeURI(`${constants.AzDoProjectURL}/_apis/wit/workitems/$bug?api-version=6.0`);
        const requestBody = [
            {
                op: "add",
                path: "/fields/System.Title",
                value: name,
            },
            {
                op: "add",
                path: "/fields/System.Description",
                value: description,
            },
            {
                op: "add",
                path: "/fields/System.Tags",
                value: "qTest",
            },
            {
                op: "add",
                path: "/relations/-",
                value: {
                    rel: "Hyperlink",
                    url: link,
                },
            },
        ];
        try {
            const bug = await doAzDoRequest(url, "POST", requestBody);
            console.log(`[Info] Bug created in Azure DevOps`);
            return bug;
        } catch (error) {
            console.log(`[Error] Failed to create bug in Azure DevOps: ${error}`);
        }
    }

    async function updateDefectSummary(defectId, fieldId, fieldValue) {
        const url = `https://${constants.ManagerURL}/api/v3/projects/${constants.ProjectID}/defects/${defectId}`;
        const requestBody = {
            properties: [
                {
                    field_id: fieldId,
                    field_value: fieldValue,
                },
            ],
        };

        console.log(`[Info] Updating defect '${defectId}'.`);

        try {
            await doqTestRequest(url, "PUT", requestBody);
            console.log(`[Info] Defect '${defectId}' updated.`);
        } catch (error) {
            console.log(`[Error] Failed to update defect '${defectId}'.`, error);
        }
    }

    async function doqTestRequest(url, method, requestBody) {
        const qTestHeaders = {
            "Content-Type": "application/json",
            Authorization: `bearer ${constants.QTEST_TOKEN}`,
        };
        const opts = {
            url: url,
            json: true,
            headers: qTestHeaders,
            body: requestBody,
            method: method,
        };

        return new Promise((resolve, reject) => {
            request(opts, function (error, response, body) {
                if (error) reject(error);
                if (response.statusCode < 200 || response.statusCode >= 300) reject(`HTTP ${response.statusCode}`);

                resolve(body);
            });
        });
    }

    async function doAzDoRequest(url, method, requestBody) {
        const basicToken = Buffer.from(`:${constants.AZDO_TOKEN}`).toString("base64");

        const opts = {
            url: url,
            json: true,
            headers: {
                "Content-Type": "application/json-patch+json",
                Authorization: `basic ${basicToken}`,
            },
            body: requestBody,
            method: method,
        };

        return new Promise((resolve, reject) => {
            request(opts, function (error, response, body) {
                if (error) reject(error);
                if (response.statusCode < 200 || response.statusCode >= 300) reject(`HTTP ${response.statusCode}`);

                resolve(body);
            });
        });
    }
};
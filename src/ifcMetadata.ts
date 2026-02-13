import * as WebIFC from "web-ifc";

/**
 * Get building information from IFC file
 */
export async function getBuildingInfo(ifcAPI: WebIFC.IfcAPI, modelID: number) {
  const buildings = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCBUILDING);
  const buildingList = [];

  for (let i = 0; i < buildings.size(); i++) {
    const buildingID = buildings.get(i);
    const building = await ifcAPI.GetLine(modelID, buildingID);

    buildingList.push({
      id: buildingID,
      name: building.Name?.value || "",
      longName: building.LongName?.value || "",
      description: building.Description?.value || "",
      elevation: building.ElevationOfRefHeight?.value,
    });
  }

  return buildingList;
}

/**
 * Get project units from IFC file
 */
export async function getProjectUnits(ifcAPI: WebIFC.IfcAPI, modelID: number) {
  const projects = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
  if (projects.size() === 0) return null;

  const project = await ifcAPI.GetLine(modelID, projects.get(0));
  if (!project.UnitsInContext) return null;

  const unitAssignment = await ifcAPI.GetLine(modelID, project.UnitsInContext.value);
  const units = [];

  // Parse units
  if (unitAssignment.Units) {
    for (const unitRef of unitAssignment.Units) {
      if (unitRef.value) {
        const unit = await ifcAPI.GetLine(modelID, unitRef.value);
        units.push({
          type: unit.type,
          unitType: unit.UnitType?.value,
          name: unit.Name?.value,
          prefix: unit.Prefix?.value,
          value: unit.Value?.value,
        });
      }
    }
  }

  return units;
}

/**
 * Get properties from a property set
 */
async function getPropertiesFromSet(ifcAPI: WebIFC.IfcAPI, modelID: number, propertySet: any) {
  const properties = [];

  if (propertySet.HasProperties) {
    for (const propRef of propertySet.HasProperties) {
      if (propRef.value) {
        const prop = await ifcAPI.GetLine(modelID, propRef.value);
        properties.push({
          name: prop.Name?.value,
          description: prop.Description?.value,
          value: prop.NominalValue?.value,
          type: prop.NominalValue?.type,
        });
      }
    }
  }

  return properties;
}

/**
 * Get all property sets from IFC model
 */
export async function getAllPropertySets(ifcAPI: WebIFC.IfcAPI, modelID: number) {
  const propertySets = [];
  const propertySetIds = new Set<number>();

  try {
    // Get all IFCPROPERTYSET entities directly
    const propSetLines = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROPERTYSET);

    for (let i = 0; i < propSetLines.size(); i++) {
      const propSetID = propSetLines.get(i);

      // Skip if we've already processed this property set
      if (propertySetIds.has(propSetID)) continue;
      propertySetIds.add(propSetID);

      const propSet = await ifcAPI.GetLine(modelID, propSetID);
      const properties = await getPropertiesFromSet(ifcAPI, modelID, propSet);

      propertySets.push({
        id: propSetID,
        name: propSet.Name?.value,
        description: propSet.Description?.value,
        properties,
      });
    }
  } catch (error) {
    console.warn("Error extracting property sets:", error);
  }

  return propertySets;
}

/**
 * Extract high-level IFC metadata (project, software, author, organization)
 */
export function extractIfcMetadata(ifcAPI: WebIFC.IfcAPI, modelID: number): any {
  const metadata: any = {
    projectName: null,
    projectDescription: null,
    software: null,
    author: null,
    organization: null,
    // schema: null,
  };

  try {
    // Get all lines of type IFCPROJECT
    const projects = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    if (projects.size() > 0) {
      const projectID = projects.get(0);
      const project = ifcAPI.GetLine(modelID, projectID);

      if (project) {
        metadata.projectName = project.Name?.value || project.LongName?.value || null;
        metadata.projectDescription = project.Description?.value || null;
      }
    }

    // Get IFCAPPLICATION for software info
    const applications = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCAPPLICATION);
    if (applications.size() > 0) {
      const appID = applications.get(0);
      const app = ifcAPI.GetLine(modelID, appID);

      if (app) {
        metadata.software = app.ApplicationFullName?.value || app.ApplicationIdentifier?.value || null;
      }
    }

    // Get IFCPERSON for author info
    const persons = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPERSON);
    if (persons.size() > 0) {
      const personID = persons.get(0);
      const person = ifcAPI.GetLine(modelID, personID);

      if (person) {
        const givenName = person.GivenName?.value || "";
        const familyName = person.FamilyName?.value || "";
        const id = person.Identification?.value || "";
        metadata.author = [givenName, familyName, id].filter(Boolean).join(" ") || null;
      }
    }

    // Get IFCORGANIZATION
    const organizations = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCORGANIZATION);
    if (organizations.size() > 0) {
      const orgID = organizations.get(0);
      const org = ifcAPI.GetLine(modelID, orgID);

      if (org) {
        metadata.organization = org.Name?.value || null;
      }
    }

    // Schema information is not directly exposed by web-ifc; could be inferred if needed
  } catch (error) {
    console.warn("Error extracting IFC metadata:", error);
  }

  return metadata;
}

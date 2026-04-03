import { Request, Response } from 'express';
import { projectService } from '../services/project.services';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

export class ProjectController {

  /**
   * POST /api/project/submit
   * Body: { private_key, name, location_id, capacity_kw, cost_apt, description, documents_hash, expected_yield_bps }
   */
  async submitProject(req: Request, res: Response) {
    try {
      const {
        private_key,
        name,
        location_id,
        capacity_kw,
        cost_apt,
        description,
        documents_hash,
        expected_yield_bps,
      } = req.body;

      if (!private_key || !name || location_id === undefined || !capacity_kw ||
          !cost_apt || !description || !documents_hash || expected_yield_bps === undefined) {
        return res.status(400).json({
          success: false,
          error: 'All fields are required: private_key, name, location_id, capacity_kw, cost_apt, description, documents_hash, expected_yield_bps',
        });
      }

      const installerAccount = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(private_key),
      });

      const result = await projectService.submitProject(
        installerAccount,
        name,
        Number(location_id),
        Number(capacity_kw),
        cost_apt.toString(),
        description,
        documents_hash,
        Number(expected_yield_bps),
      );

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Project submission failed' });
    }
  }

  /**
   * GET /api/project/locations
   * Returns all locations with solar oracle data
   */
  async getLocations(req: Request, res: Response) {
    try {
      // Hardcoded solar oracle locations (fallback if oracle contract not accessible)
      const locations = [
        { id: 1, name: "San Francisco, CA", lat: 37.7749, lng: -122.4194, dni: 4.05, ghi: 4.34, lat_tilt: 4.96, potential: "Good",      updated_at: "08/03/2026, 21:25:07" },
        { id: 2, name: "New York City, NY", lat: 40.7128, lng: -74.006,  dni: 3.79, ghi: 3.93, lat_tilt: 4.62, potential: "Fair",      updated_at: "08/03/2026, 21:25:14" },
        { id: 3, name: "Phoenix, AZ",       lat: 33.4484, lng: -112.074, dni: 7.35, ghi: 5.78, lat_tilt: 6.68, potential: "Excellent", updated_at: "08/03/2026, 21:25:20" },
      ];

      res.json({
        success: true,
        data: locations,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch locations' });
    }
  }

  /**
   * GET /api/project/location/:location_id
   * Returns all APPROVED projects for a given oracle location
   */
  async getProjectsByLocation(req: Request, res: Response) {
    try {
      const locationId = Number(req.params.location_id);

      if (isNaN(locationId)) {
        return res.status(400).json({ success: false, error: 'Invalid location_id' });
      }

      const projects = await projectService.getProjectsByLocation(locationId);

      res.json({
        success: true,
        data: {
          location_id: locationId,
          projects,
          total: projects.length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch projects' });
    }
  }

  /**
   * GET /api/project/:project_id
   * Returns a single project by ID
   */
  async getProject(req: Request, res: Response) {
    try {
      const projectId = Number(req.params.project_id);

      if (isNaN(projectId)) {
        return res.status(400).json({ success: false, error: 'Invalid project_id' });
      }

      const project = await projectService.getProject(projectId);

      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }

      res.json({ success: true, data: project });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch project' });
    }
  }
}

export const projectController = new ProjectController();
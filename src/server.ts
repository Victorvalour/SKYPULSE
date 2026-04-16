import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { RouteCapacityChangeSchema, routeCapacityChange } from './tools/routeChange.js';
import { NewRouteLaunchesSchema, newRouteLaunches } from './tools/routeLaunches.js';
import { FrequencyLosersSchema, frequencyLosers } from './tools/carrierComparison.js';
import {
  CapacityDriverAnalysisSchema,
  capacityDriverAnalysis,
} from './tools/capacityAnalysis.js';
import {
  CarrierCapacityRankingSchema,
  carrierCapacityRanking,
} from './tools/marketLeaderboard.js';
import { logger } from './utils/logger.js';

// Tool definitions with JSON Schema for MCP listing
const TOOL_DEFINITIONS = [
  {
    name: 'route_capacity_change',
    description:
      'Query route-level capacity and frequency change intelligence for a specific airport pair. Returns ranked carrier changes with full metadata including data freshness.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: {
          type: 'string',
          description: 'IATA origin airport code (e.g. JFK)',
          minLength: 3,
          maxLength: 3,
        },
        destination: {
          type: 'string',
          description: 'IATA destination airport code (e.g. LAX)',
          minLength: 3,
          maxLength: 3,
        },
        days_back: {
          type: 'number',
          description: 'Look back N days (default 365)',
          minimum: 1,
          maximum: 730,
        },
      },
      required: ['origin', 'destination'],
    },
  },
  {
    name: 'new_route_launches',
    description:
      'Detect new route launches and service resumptions at a given airport. Returns a list of new routes with carrier, frequency, and effective date.',
    inputSchema: {
      type: 'object',
      properties: {
        airport: {
          type: 'string',
          description: 'IATA airport code (e.g. ORD)',
          minLength: 3,
          maxLength: 3,
        },
        period: {
          type: 'string',
          description: 'Period filter, e.g. "2025-Q3". Returns all recent periods if omitted.',
        },
      },
      required: ['airport'],
    },
  },
  {
    name: 'frequency_losers',
    description:
      'Return routes losing the most frequency/capacity, ranked by percentage decline. Useful for competitive intelligence and market contraction analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        market: {
          type: 'string',
          description: 'IATA airport code to scope the leaderboard (optional)',
          minLength: 3,
          maxLength: 3,
        },
        period: {
          type: 'string',
          description: 'Period filter, e.g. "2025-Q3". Returns all recent periods if omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: 'capacity_driver_analysis',
    description:
      'Determine whether capacity change on a route is frequency-driven (more/fewer flights) or gauge-driven (larger/smaller aircraft). Returns detailed aircraft mix analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: {
          type: 'string',
          description: 'IATA origin airport code',
          minLength: 3,
          maxLength: 3,
        },
        destination: {
          type: 'string',
          description: 'IATA destination airport code',
          minLength: 3,
          maxLength: 3,
        },
        carrier: {
          type: 'string',
          description: 'IATA carrier code (optional, returns all carriers if omitted)',
          minLength: 2,
          maxLength: 2,
        },
      },
      required: ['origin', 'destination'],
    },
  },
  {
    name: 'carrier_capacity_ranking',
    description:
      'Rank carriers by capacity change in a given market. Returns a leaderboard of carriers sorted by total seat capacity growth or decline.',
    inputSchema: {
      type: 'object',
      properties: {
        market: {
          type: 'string',
          description: 'IATA airport code defining the market (origin or destination)',
          minLength: 3,
          maxLength: 3,
        },
        aircraft_category: {
          type: 'string',
          description: 'Filter by aircraft category',
          enum: ['narrowbody', 'widebody', 'regional_jet', 'turboprop', 'other'],
        },
        period: {
          type: 'string',
          description: 'Period filter, e.g. "2025-Q3". Returns all recent periods if omitted.',
        },
      },
      required: ['market'],
    },
  },
];

export function createServer(): Server {
  const server = new Server(
    {
      name: 'skypulse',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOL_DEFINITIONS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'route_capacity_change': {
          const input = RouteCapacityChangeSchema.parse(args);
          const result = await routeCapacityChange(input);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'new_route_launches': {
          const input = NewRouteLaunchesSchema.parse(args);
          const result = await newRouteLaunches(input);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'frequency_losers': {
          const input = FrequencyLosersSchema.parse(args);
          const result = await frequencyLosers(input);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'capacity_driver_analysis': {
          const input = CapacityDriverAnalysisSchema.parse(args);
          const result = await capacityDriverAnalysis(input);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'carrier_capacity_ranking': {
          const input = CarrierCapacityRankingSchema.parse(args);
          const result = await carrierCapacityRanking(input);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'UNKNOWN_TOOL',
                  message: `Unknown tool: ${name}`,
                }),
              },
            ],
            isError: true,
          };
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        logger.warn('Tool input validation error', { tool: name, errors: err.errors });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'INVALID_INPUT',
                message: 'Input validation failed',
                details: err.errors,
              }),
            },
          ],
          isError: true,
        };
      }

      logger.error('Tool execution error', { tool: name, error: String(err) });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'TOOL_ERROR',
              message: err instanceof Error ? err.message : 'Internal error',
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

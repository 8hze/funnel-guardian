import type { ProbeObservation } from '@funnel-guardian/triage-gate';
import type { LinearTicket } from './types.ts';

export class LinearAdapter {
  private counter: number;
  private tickets: Map<string, LinearTicket>;

  constructor(initialCounter = 101, initialTickets: LinearTicket[] = []) {
    this.counter = initialCounter;
    this.tickets = new Map(initialTickets.map((t) => [t.id, { ...t }]));
  }

  async createIncidentTicket(
    observation: ProbeObservation,
    incidentHash: string,
    title: string
  ): Promise<LinearTicket> {
    const apiKey = process.env.LINEAR_API_KEY;
    const teamId = process.env.LINEAR_TEAM_ID;

    if (apiKey && teamId) {
      try {
        const res = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: apiKey,
          },
          body: JSON.stringify({
            query: `mutation CreateIssue($input: IssueCreateInput!) {
              issueCreate(input: $input) {
                success
                issue { identifier title url }
              }
            }`,
            variables: {
              input: {
                teamId,
                title: `[Funnel Guardian] ${title}`,
                description: `Incident Hash: \`${incidentHash}\`\nFlow: \`${observation.flow}\`\nRoute: \`${observation.route}\`\nViewport: \`${observation.viewport}\`\nSummary: ${observation.summary}`,
              },
            },
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            data?: { issueCreate?: { issue?: { identifier: string; title: string; url: string } } };
          };
          const issue = json.data?.issueCreate?.issue;
          if (issue) {
            const ticket: LinearTicket = {
              id: issue.identifier,
              title: issue.title,
              state: 'In Progress',
              hash: incidentHash,
              url: issue.url,
              mode: 'live-api',
              createdAt: new Date().toISOString(),
            };
            this.tickets.set(ticket.id, ticket);
            return ticket;
          }
        }
      } catch {
        // Fall through cleanly to local ledger if network/auth unavailable
      }
    }

    const id = `FG-${this.counter++}`;
    const ticket: LinearTicket = {
      id,
      title: `[Funnel Guardian] ${title}`,
      state: 'In Progress',
      hash: incidentHash,
      url: `https://linear.app/funnel-guardian/issue/${id}`,
      mode: 'local-ledger',
      createdAt: new Date().toISOString(),
    };
    this.tickets.set(id, ticket);
    return ticket;
  }

  updateState(ticketId: string, state: LinearTicket['state']): LinearTicket | undefined {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return undefined;
    ticket.state = state;
    return { ...ticket };
  }

  list(): LinearTicket[] {
    return Array.from(this.tickets.values()).map((t) => ({ ...t }));
  }

  getNextCounter(): number {
    return this.counter;
  }
}

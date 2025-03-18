import { z } from 'zod';

interface GitRepoMetadata {
  owner: string;
  repo: string;
  branch?: string;
  commit?: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
  isPrivate: boolean;
}

interface GitHubRepoResponse {
  private: boolean;
}

interface ParsedGitUrl {
  metadata: GitRepoMetadata;
  normalizedUrl: string;
  originalUrl: string;
}

interface ParseOptions {
  authToken?: string;
}

const gitUrlSchema = z.string().refine(
  (url) => {
    try {
      // Test if it's a valid URL
      if (url.includes('://')) {
        new URL(url);
        return true;
      }
      // Test if it's a shorthand format (user/repo)
      return /^[\w-]+\/[\w.-]+$/.test(url);
    } catch {
      return false;
    }
  },
  { message: 'Invalid Git repository URL format' }
);

export class GitRepoParser {
  private static readonly PROVIDER_PATTERNS = {
    github: /github\.com/,
    gitlab: /gitlab\.com/,
    bitbucket: /bitbucket\.org/,
  };

  private static readonly BRANCH_PATTERN = /\/tree\/([\w.-]+)/;
  private static readonly COMMIT_PATTERN = /\/commit\/([a-f0-9]+)/i;

  static async parse(url: string, options: ParseOptions = {}): Promise<ParsedGitUrl> {
    // Validate URL format
    gitUrlSchema.parse(url);

    // Handle shorthand format (user/repo)
    if (!url.includes('://')) {
      url = `https://github.com/${url}`;
    }

    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);

    // Determine provider
    const provider = Object.entries(this.PROVIDER_PATTERNS).find(([_, pattern]) =>
      pattern.test(urlObj.hostname)
    )?.[0] as GitRepoMetadata['provider'] || 'github';

    // Extract branch
    const branchMatch = url.match(this.BRANCH_PATTERN);
    const branch = branchMatch ? branchMatch[1] : undefined;

    // Extract commit
    const commitMatch = url.match(this.COMMIT_PATTERN);
    const commit = commitMatch ? commitMatch[1] : undefined;

    // Extract owner and repo
    const [owner, repo] = pathSegments;
    const cleanRepo = repo?.replace(/\.git$/, '');

    if (!owner || !cleanRepo) {
      throw new Error('Invalid repository URL: missing owner or repository name');
    }

    // Construct normalized URL
    const normalizedUrl = `https://${urlObj.hostname}/${owner}/${cleanRepo}`;

    // Fetch repository visibility status from GitHub API
    let isPrivate = false;
    if (provider === 'github') {
      try {
        const headers: HeadersInit = {
          'Accept': 'application/vnd.github.v3+json'
        };
        if (options.authToken) {
          headers.Authorization = `token ${options.authToken}`;
        }
        const response = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`, { headers });
        if (!response.ok) {
          console.error('GitHub API Error:', {
            status: response.status,
            statusText: response.statusText,
            body: await response.text()
          });
        } else {
          const data = await response.json() as GitHubRepoResponse;
          isPrivate = data.private;
        }
      } catch (error) {
        console.error('Failed to fetch repository visibility status:', error);
      }
    }

    return {
      metadata: {
        owner,
        repo: cleanRepo,
        branch,
        commit,
        provider,
        isPrivate,
      },
      normalizedUrl,
      originalUrl: url,
    };
  }

  static validate(url: string): z.SafeParseReturnType<string, string> {
    return gitUrlSchema.safeParse(url);
  }

  static isValidProvider(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return Object.values(this.PROVIDER_PATTERNS).some((pattern) =>
        pattern.test(urlObj.hostname)
      );
    } catch {
      return false;
    }
  }
}
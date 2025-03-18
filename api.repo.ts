import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { GitRepoParser } from '~/lib/git-repo-parser';

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { url } = await request.json<{ url: string }>();
    const result = await GitRepoParser.parse(url);
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    const errorResponse = {
      error: {
        code: 'INVALID_REPOSITORY_URL',
        message: error instanceof Error ? error.message : 'Failed to parse repository URL'
      }
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
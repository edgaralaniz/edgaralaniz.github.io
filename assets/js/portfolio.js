// Portfolio.js - Handles dynamic project loading
// View counts are updated server-side by GitHub Actions workflow and pre-loaded in JSON

// Project Data Manager
const ProjectManager = {
	projects: [],

	// Extract video ID from YouTube URL
	extractVideoId: function(url) {
		if (!url) return null;

		// Handle various YouTube URL formats
		const patterns = [
			/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&]+)/,
			/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^?]+)/,
			/(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([^?]+)/,
			/^([a-zA-Z0-9_-]{11})$/ // Just video ID
		];

		for (const pattern of patterns) {
			const match = url.match(pattern);
			if (match) return match[1];
		}

		return null;
	},

	// Format view count
	formatViewCount: function(views) {
		if (!views) return 'No data';

		if (views >= 1000000) {
			return (views / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
		} else if (views >= 1000) {
			return (views / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
		}

		return views.toLocaleString();
	},

	// Load and process projects from JSON
	async loadProjects(jsonUrl) {
		try {
			console.log(`[Portfolio] Loading from: ${jsonUrl}`);
			const response = await fetch(jsonUrl);
			console.log(`[Portfolio] Fetch response: ${response.status}`);

			if (!response.ok) {
				console.error(`[Portfolio] Fetch error: ${response.status} ${response.statusText}`);
				return [];
			}

			const projects = await response.json();
			console.log(`[Portfolio] Loaded ${projects.length} total projects`);

			// Filter to only visible projects
			const filtered = projects.filter(p => {
				return p.visibility_recommendation === 'Projects Page (Public)' || p.visibility_recommendation === 'Homepage';
			});

			console.log(`[Portfolio] Filtered to ${filtered.length} visible projects`);
			return filtered;
		} catch (error) {
			console.error(`[Portfolio] Error loading projects:`, error);
			return [];
		}
	},

	// Render projects grid
	async renderProjects(containerSelector, jsonUrl) {
		const container = document.querySelector(containerSelector);
		if (!container) {
			console.error('[Portfolio] Container not found:', containerSelector);
			return;
		}

		console.log('[Portfolio] Container found, loading projects...');

		// Load projects
		const projects = await this.loadProjects(jsonUrl);
		console.log('[Portfolio] Loaded projects for rendering:', projects.length);

		if (projects.length === 0) {
			container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #a0a8b0;">No projects available yet.</p>';
			console.warn('[Portfolio] No projects to display');
			return;
		}

		// Render cards
		container.innerHTML = '';

		for (const project of projects) {
			try {
				const card = this.createProjectCard(project);
				container.appendChild(card);
			} catch (error) {
				console.error('[Portfolio] Error creating card for', project.my_role, error);
			}
		}

		console.log('[Portfolio] Rendered', container.children.length, 'cards');
	},

	// Create project card element
	createProjectCard(project) {
		const card = document.createElement('div');
		card.className = 'project-card';

		// Extract data from JSON
		const channel = project.channel || '';
		const hook = project.my_role || '';
		const videoUrl = project.youtube_url || '';
		const videoId = this.extractVideoId(videoUrl);

		console.log(`[Portfolio] Creating card for: ${hook.substring(0, 50)}... (videoId: ${videoId})`);

		// Get thumbnail URL
		let thumbnailUrl = '';
		if (videoId) {
			thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
		}

		// Get view count from JSON (already updated by GitHub Actions)
		let viewCount = project['youtube_views'] || '';
		const formattedViews = viewCount ? this.formatViewCount(viewCount) : 'Views unavailable';

		// Build HTML
		let html = '<div class="project-thumbnail">';

		if (thumbnailUrl) {
			html += `<img src="${thumbnailUrl}" alt="YouTube video thumbnail" loading="lazy" decoding="async">`;
		} else {
			html += '<div style="width: 100%; height: 100%; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; color: #a0a8b0;">No image</div>';
		}

		html += '</div>';
		html += '<div class="project-card-content">';
		html += '<div class="project-card-header">';
		html += `<div class="project-card-meta">${escapeHtml(channel)} • ${formattedViews} views</div>`;
		html += '</div>';
		html += `<p class="project-card-hook">${escapeHtml(hook)}</p>`;

		// Add link if available
		if (videoUrl) {
			html += `<a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener" style="margin-top: auto; padding-top: 1rem; display: inline-block; color: #ffffff; border-bottom: 1px dotted rgba(255,255,255,0.5); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1rem;">Watch on YouTube</a>`;
		}

		html += '</div>';

		card.innerHTML = html;
		return card;
	}
};

// Utility function to escape HTML
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
	console.log('[Portfolio] DOMContentLoaded fired');

	// Render projects from JSON
	console.log('[Portfolio] Starting renderProjects...');
	ProjectManager.renderProjects(
		'#projects-grid',
		'portfolio_projects_public.json'
	);

	// Smooth scroll navigation
	document.querySelectorAll('.smooth-scroll').forEach(link => {
		link.addEventListener('click', function(e) {
			e.preventDefault();
			const target = this.getAttribute('href');
			const element = document.querySelector(target);
			if (element) {
				element.scrollIntoView({ behavior: 'smooth' });
			}
		});
	});

	// Optional: Remove preload class after initial render
	setTimeout(() => {
		document.body.classList.remove('is-preload');
	}, 500);
});

// Portfolio.js - Handles dynamic project loading and YouTube API integration

// YouTube Data API Configuration
const YOUTUBE_API_CONFIG = {
	// API key should be set from environment or meta tag
	// Never hardcode the API key
	getApiKey: function() {
		// Try to get from meta tag first
		const metaTag = document.querySelector('meta[name="youtube-api-key"]');
		if (metaTag) return metaTag.content;

		// Otherwise, API calls will fail gracefully
		return null;
	},

	// Cache for view counts (24 hours)
	cacheKey: 'youtube_views_cache',
	cacheExpiry: 24 * 60 * 60 * 1000, // 24 hours in milliseconds

	// Get cached view count
	getCachedViews: function(videoId) {
		const cache = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
		const cached = cache[videoId];

		if (cached && (Date.now() - cached.timestamp < this.cacheExpiry)) {
			return cached.views;
		}
		return null;
	},

	// Save view count to cache
	setCachedViews: function(videoId, views) {
		const cache = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
		cache[videoId] = {
			views: views,
			timestamp: Date.now()
		};
		localStorage.setItem(this.cacheKey, JSON.stringify(cache));
	},

	// Fetch video data from YouTube API (views, metadata, and publish date)
	fetchVideoData: async function(videoId) {
		// Check cache first
		const cached = this.getCachedViews(videoId);
		if (cached !== null) {
			return cached;
		}

		const apiKey = this.getApiKey();
		if (!apiKey) {
			console.warn('YouTube API key not configured. Video data will not be fetched.');
			return null;
		}

		try {
			const response = await fetch(
				`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=statistics,snippet`
			);

			if (!response.ok) {
				console.error('YouTube API error:', response.status);
				return null;
			}

			const data = await response.json();
			if (data.items && data.items.length > 0) {
				const item = data.items[0];
				const videoData = {
					views: parseInt(item.statistics.viewCount || 0),
					title: item.snippet.title || '',
					publishedAt: item.snippet.publishedAt || ''
				};
				this.setCachedViews(videoId, videoData);
				return videoData;
			}
		} catch (error) {
			console.error('Error fetching YouTube video data:', error);
		}

		return null;
	}
};

// Project Data Manager
const ProjectManager = {
	projects: [],

	// Parse CSV data
	parseCSV: function(csvText) {
		const lines = csvText.trim().split('\n');
		if (lines.length < 2) return [];

		// Parse header
		const headers = this.parseCSVLine(lines[0]).map(h =>
			h.toLowerCase().trim().replace(/^"|"$/g, '')
		);

		// Parse rows
		const projects = [];
		for (let i = 1; i < lines.length; i++) {
			if (!lines[i].trim()) continue;

			const values = this.parseCSVLine(lines[i]);
			const project = {};

			headers.forEach((header, index) => {
				project[header] = (values[index] || '').trim();
			});

			projects.push(project);
		}

		return projects;
	},

	// Parse CSV line handling quoted values (RFC 4180 compliant)
	parseCSVLine: function(line) {
		const result = [];
		let current = '';
		let inQuotes = false;
		let i = 0;

		while (i < line.length) {
			const char = line[i];

			if (char === '"') {
				if (inQuotes && line[i + 1] === '"') {
					// Escaped quote
					current += '"';
					i += 2;
				} else {
					// Toggle quote state
					inQuotes = !inQuotes;
					i++;
				}
			} else if (char === ',' && !inQuotes) {
				// End of field
				result.push(current.trim().replace(/^"|"$/g, ''));
				current = '';
				i++;
			} else {
				current += char;
				i++;
			}
		}

		result.push(current.trim().replace(/^"|"$/g, ''));
		return result;
	},

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

			// Fetch live YouTube metadata for all projects in parallel
			console.log(`[Portfolio] Fetching live YouTube metadata...`);
			const fetchPromises = filtered.map(async (project) => {
				if (project.youtube_url) {
					const videoId = this.extractVideoId(project.youtube_url);
					if (videoId) {
						const videoData = await YOUTUBE_API_CONFIG.fetchVideoData(videoId);
						if (videoData) {
							if (videoData.views) {
								project.youtube_views = videoData.views;
							}
							if (videoData.publishedAt) {
								project.publishedAt = videoData.publishedAt;
								console.log(`[Portfolio] Updated ${project.project_name}: ${videoData.publishedAt.split('T')[0]} (${videoData.views.toLocaleString()} views)`);
							}
						}
					}
				}
			});

			await Promise.all(fetchPromises);
			console.log(`[Portfolio] Finished fetching YouTube metadata`);

			// Sort by publish date descending (newest first)
			filtered.sort((a, b) => {
				const dateA = new Date(a.publishedAt || 0);
				const dateB = new Date(b.publishedAt || 0);
				return dateB - dateA;
			});

			console.log(`[Portfolio] Sorted projects by publish date (newest first), returning ${filtered.length}`);
			console.log(`[Portfolio] Final sort order:`, filtered.map(p => `${p.project_name} (${(p.publishedAt || 'unknown').split('T')[0]})`));
			return filtered;
		} catch (error) {
			console.error(`[Portfolio] Error loading projects:`, error);
			return [];
		}
	},

	// Render projects grid
	async renderProjects(containerSelector, csvUrl) {
		const container = document.querySelector(containerSelector);
		if (!container) {
			console.error('[Portfolio] Container not found:', containerSelector);
			return;
		}

		console.log('[Portfolio] Container found, loading projects...');

		// Load projects
		const projects = await this.loadProjects(csvUrl);
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
				const card = await this.createProjectCard(project);
				container.appendChild(card);
			} catch (error) {
				console.error('[Portfolio] Error creating card for', project.project_name, error);
			}
		}

		console.log('[Portfolio] Rendered', container.children.length, 'cards');
	},

	// Create project card element
	async createProjectCard(project) {
		const card = document.createElement('div');
		card.className = 'project-card';

		// Extract data from JSON
		const channel = project.channel || '';
		const hook = project.my_role || '';
		const skills = project.skills || '';
		const tools = project.tools || '';
		const outcomes = project.outcomes || '';
		const videoUrl = project.youtube_url || '';
		const videoId = this.extractVideoId(videoUrl);

		console.log(`[Portfolio] Creating card for: ${project.project_name} (videoId: ${videoId})`);

		// Get thumbnail URL
		let thumbnailUrl = '';
		if (videoId) {
			thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
		}

		// Get title and view count (view count was already updated in loadProjects with live data)
		let title = project['project_name'] || 'Untitled Project';
		let viewCount = project['youtube_views'] || '';

		// Only fetch title from YouTube if we have a video ID
		if (videoId) {
			const videoData = await YOUTUBE_API_CONFIG.fetchVideoData(videoId);
			if (videoData && videoData.title) {
				title = videoData.title;
			}
		}

		const formattedViews = viewCount ? this.formatViewCount(viewCount) : 'Views unavailable';

		// Build HTML
		let html = '<div class="project-thumbnail">';

		if (thumbnailUrl) {
			html += `<img src="${thumbnailUrl}" alt="${title}" loading="lazy" decoding="async">`;
		} else {
			html += '<div style="width: 100%; height: 100%; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; color: #a0a8b0;">No image</div>';
		}

		html += '</div>';
		html += '<div class="project-card-content">';
		html += '<div class="project-card-header">';
		html += `<h3 class="project-card-title">${escapeHtml(title)}</h3>`;
		html += `<div class="project-card-meta">${escapeHtml(channel)} • ${formattedViews} views</div>`;
		html += '</div>';
		html += `<p class="project-card-hook">${escapeHtml(hook)}</p>`;

	if (skills) {
		html += `<p class="project-card-detail"><strong>Skills:</strong> ${escapeHtml(skills)}</p>`;
	}

	if (tools) {
		html += `<p class="project-card-detail"><strong>Tools:</strong> ${escapeHtml(tools)}</p>`;
	}

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

	// Clear old cache to fetch fresh video titles
	localStorage.removeItem('youtube_views_cache');

	// Render projects from JSON
	console.log('[Portfolio] Starting renderProjects...');
	ProjectManager.renderProjects(
		'#projects-grid',
		'portfolio_projects.json'
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

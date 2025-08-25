// Logs page JavaScript functionality
let currentPage = 1;
let totalPages = 1;

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    loadLogs();
});

function setupEventListeners() {
    document.getElementById('timeRange').addEventListener('change', function() {
        const customDates = document.getElementById('customDates');
        const customDatesEnd = document.getElementById('customDatesEnd');
        if (this.value === 'custom') {
            customDates.classList.remove('hidden');
            customDatesEnd.classList.remove('hidden');
        } else {
            customDates.classList.add('hidden');
            customDatesEnd.classList.add('hidden');
        }
    });

    document.getElementById('filterBtn').addEventListener('click', function() {
        currentPage = 1;
        loadLogs();
    });

    document.getElementById('refreshBtn').addEventListener('click', function() {
        currentPage = 1;
        loadLogs();
    });

    document.getElementById('prevBtn').addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            loadLogs();
        }
    });

    document.getElementById('nextBtn').addEventListener('click', function() {
        if (currentPage < totalPages) {
            currentPage++;
            loadLogs();
        }
    });

    // Auto-refresh every 30 seconds
    setInterval(function() {
        if (document.getElementById('timeRange').value !== 'custom') {
            loadLogs();
        }
    }, 30000);
}

function loadLogs() {
    showLoading();

    const params = new URLSearchParams({
        timeRange: document.getElementById('timeRange').value,
        page: currentPage.toString(),
        limit: '50'
    });

    const logLevel = document.getElementById('logLevel').value;
    if (logLevel) params.append('level', logLevel);

    const searchText = document.getElementById('searchText').value;
    if (searchText) params.append('search', searchText);

    if (document.getElementById('timeRange').value === 'custom') {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
    }

    fetch(`/logs/api?${params.toString()}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showError(data.message);
            } else {
                displayLogs(data);
                updatePagination(data.pagination);
                updateStats(data);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showError('Failed to load logs: ' + error.message);
        });
}

function showLoading() {
    document.getElementById('loadingDiv').classList.remove('hidden');
    document.getElementById('errorDiv').classList.add('hidden');
    document.getElementById('logsContainer').classList.add('hidden');
    document.getElementById('paginationDiv').classList.add('hidden');
    document.getElementById('stats').classList.add('hidden');
}

function showError(message) {
    document.getElementById('loadingDiv').classList.add('hidden');
    document.getElementById('errorDiv').textContent = message;
    document.getElementById('errorDiv').classList.remove('hidden');
    document.getElementById('logsContainer').classList.add('hidden');
    document.getElementById('paginationDiv').classList.add('hidden');
    document.getElementById('stats').classList.add('hidden');
}

function displayLogs(data) {
    document.getElementById('loadingDiv').classList.add('hidden');
    document.getElementById('errorDiv').classList.add('hidden');

    const container = document.getElementById('logsContainer');
    container.classList.remove('hidden');

    const logs = data.data || []; // API returns logs in data.data field

    if (logs.length === 0) {
        container.innerHTML = '<div class="no-logs">No logs found for the selected filters.</div>';
        return;
    }

    container.innerHTML = logs.map(log => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        return `
            <div class="log-entry">
                <span class="log-timestamp">[${timestamp}]</span>
                <span class="log-level log-level-${log.level}">${log.level}</span>
                <span class="log-message">${escapeHtml(log.message)}</span>
            </div>
        `;
    }).join('');
}

function updatePagination(pagination) {
    const paginationDiv = document.getElementById('paginationDiv');
    const paginationInfo = document.getElementById('paginationInfo');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (pagination && pagination.totalPages > 1) {
        paginationDiv.classList.remove('hidden');
        paginationInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total items)`;
        
        prevBtn.disabled = pagination.page <= 1;
        nextBtn.disabled = pagination.page >= pagination.totalPages;
        
        currentPage = pagination.page;
        totalPages = pagination.totalPages;
    } else {
        paginationDiv.classList.add('hidden');
    }
}

function updateStats(response) {
    const stats = document.getElementById('stats');
    stats.classList.remove('hidden');

    const logs = response.data || []; // response.data contains the logs array
    const logCounts = logs.reduce((acc, log) => {
        acc[log.level] = (acc[log.level] || 0) + 1;
        return acc;
    }, {});

    document.getElementById('totalLogs').textContent = response.pagination?.total || logs.length;
    document.getElementById('errorCount').textContent = logCounts.ERROR || 0;
    document.getElementById('warnCount').textContent = logCounts.WARN || 0;
    document.getElementById('infoCount').textContent = logCounts.INFO || 0;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

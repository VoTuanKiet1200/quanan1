// utils/pagination.js
function buildPagination({ pageQuery, limit = 10, total }) {
    const page = Math.max(parseInt(pageQuery || "1", 10), 1);
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    return {
        page: safePage,
        limit,
        total,
        totalPages,
        skip,
        hasPrev: safePage > 1,
        hasNext: safePage < totalPages,
        prevPage: safePage - 1,
        nextPage: safePage + 1,
    };
}

module.exports = { buildPagination };

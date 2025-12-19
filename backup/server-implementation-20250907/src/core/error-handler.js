/**
 * 고도화된 에러 처리 시스템
 */

class CodeBError extends Error {
    constructor(message, code, context = {}) {
        super(message);
        this.name = 'CodeBError';
        this.code = code;
        this.context = context;
        this.timestamp = new Date().toISOString();
    }
}

class ErrorHandler {
    static handle(error, req = null, res = null) {
        const errorInfo = {
            message: error.message,
            code: error.code || 'UNKNOWN',
            timestamp: new Date().toISOString(),
            context: error.context || {}
        };

        // 로깅
        console.error('CodeB Error:', errorInfo);

        // HTTP 응답 (Express 환경일 때만)
        if (res && typeof res.status === 'function') {
            const statusCode = this.getStatusCode(error.code);
            res.status(statusCode).json({
                error: true,
                ...errorInfo
            });
        }

        return errorInfo;
    }

    static getStatusCode(code) {
        const statusMap = {
            'VALIDATION_ERROR': 400,
            'UNAUTHORIZED': 401,
            'NOT_FOUND': 404,
            'TIMEOUT': 408,
            'INTERNAL_ERROR': 500
        };
        return statusMap[code] || 500;
    }
}

module.exports = { CodeBError, ErrorHandler };
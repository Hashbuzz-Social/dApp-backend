import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { convertTrxString } from './helper';
import { getConfig } from 'src/appConfig';

class NetworkHelpers {
    private axiosInstance: AxiosInstance;

    constructor() {
        // Initialize axiosInstance with a default configuration
        this.axiosInstance = axios.create({
            timeout: 10000, // Set a timeout for requests
        });

        // Add a response interceptor
        this.axiosInstance.interceptors.response.use(
            this.handleResponse,
            this.handleError
        );
    }

    // Method to initialize axiosInstance with the actual configuration
    async init() {
        const configs = await getConfig();
        this.axiosInstance.defaults.baseURL = configs.app.mirrorNodeURL;
    }

    // Method to handle responses
    private handleResponse(response: AxiosResponse) {
        return response;
    }

    // Method to handle errors
    private handleError(error: AxiosError) {
        if (error.response) {
            // Server responded with a status other than 200 range
            console.error('Error response:', error.response);
        } else if (error.request) {
            // Request was made but no response received
            console.error('Error request:', error.request);
        } else {
            // Something happened in setting up the request
            console.error('Error message:', error.message);
        }
        return Promise.reject(error);
    }

    // Method to get token details
    async getTokenDetails<T>(tokenID: string): Promise<T> {
        if (!tokenID) throw new Error('Token ID not defined!');

        try {
            const response = await this.axiosInstance.get<T>(`/api/v1/tokens/${tokenID}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching token details:', error);
            throw error;
        }
    }

    async getAccountDetails<T>(accountId: string): Promise<T> {
        if (!accountId) throw new Error('Token ID not defined!');

        try {
            const response = await this.axiosInstance.get<T>(`/api/v1/accounts/${accountId}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching token details:', error);
            throw error;
        }
    }

    async getTransactionDetails<T>(transactionId: string): Promise<T> {
        if (!transactionId) throw new Error('Token ID not defined!');
        //${nodeURI}/api/v1/transactions/${convertTrxString(transactionId)}?nonce=0
        try {
            const response = await this.axiosInstance.get<T>(`/api/v1/transactions/${convertTrxString(transactionId)}?nonce=0`);
            return response.data;
        } catch (error) {
            console.error('Error fetching token details:', error);
            throw error;
        }
    }
}

export const networkHelpers = new NetworkHelpers();
export default NetworkHelpers;
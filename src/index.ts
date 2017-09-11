export interface Filter {
    limit?: number;
    skip?: number;
    q?: string;
    [key: string]: any;
}
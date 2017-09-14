import {Adapter} from "./adapters/index";

export type RecordValue = boolean | null | number | string;
export interface RecordObject {
    [key: string]: RecordValue | RecordValue[];
}

export interface Filter {
    limit?: number;
    skip?: number;
    q?: string;
    [key: string]: any;
}
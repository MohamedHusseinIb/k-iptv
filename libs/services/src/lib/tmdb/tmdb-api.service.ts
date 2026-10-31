import { Injectable } from '@angular/core';
import { TmdbApiClient } from '@kiptv/shared/tmdb';
export { TmdbApiError, isTmdbNotFound } from '@kiptv/shared/tmdb';

@Injectable({ providedIn: 'root' })
export class TmdbApiService extends TmdbApiClient {
    constructor() {
        super();
    }
}

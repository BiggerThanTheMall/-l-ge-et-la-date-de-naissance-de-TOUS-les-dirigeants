// ==UserScript==
// @name         Modulr - Âge des dirigeants sur fiche entreprise
// @namespace    https://github.com/BiggerThanTheMall/tampermonkey-ltoa
// @version      2.1
// @description  Affiche automatiquement l'âge et la date de naissance de TOUS les dirigeants sur les fiches entreprises Modulr
// @author       LTOA Assurances
// @match        https://courtage.modulr.fr/fr/scripts/clients/clients_card.php*
// @match        https://*.modulr.fr/fr/scripts/clients/clients_card.php*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @connect      courtage.modulr.fr
// @updateURL    https://raw.githubusercontent.com/BiggerThanTheMall/tampermonkey-ltoa/main/Modulr-Age-Dirigeants-Entreprise.user.js
// @downloadURL  https://raw.githubusercontent.com/BiggerThanTheMall/tampermonkey-ltoa/main/Modulr-Age-Dirigeants-Entreprise.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Fonction pour calculer l'âge
    function calculateAge(birthDateStr) {
        const parts = birthDateStr.split('/');
        if (parts.length !== 3) return null;

        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);

        const birthDate = new Date(year, month, day);
        const now = new Date();

        let age = now.getFullYear() - birthDate.getFullYear();
        const monthDiff = now.getMonth() - birthDate.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
            age--;
        }

        return age;
    }

    // Vérifier si c'est l'anniversaire
    function isBirthdayToday(birthDateStr) {
        const parts = birthDateStr.split('/');
        if (parts.length !== 3) return false;

        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;

        const now = new Date();
        return now.getDate() === day && now.getMonth() === month;
    }

    // Fonction pour récupérer la date de naissance depuis une fiche client
    async function fetchBirthDate(clientUrl) {
        return new Promise((resolve, reject) => {
            fetch(clientUrl, {
                credentials: 'include'
            })
            .then(response => response.text())
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Chercher le label "Date de naissance"
                const labels = doc.querySelectorAll('.car_template_field p.normal_fade');
                for (const label of labels) {
                    if (label.textContent.trim() === 'Date de naissance') {
                        const valueField = label.nextElementSibling;
                        if (valueField && valueField.tagName === 'P') {
                            const dateText = valueField.textContent.trim();
                            if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateText)) {
                                resolve(dateText);
                                return;
                            }
                        }
                    }
                }
                resolve(null);
            })
            .catch(err => {
                console.error('Erreur fetch:', err);
                resolve(null);
            });
        });
    }

    // Vérifier si un élément tooltip contient une fiche personne (pas entreprise)
    function isPersonFromTooltip(tooltipHidden) {
        if (!tooltipHidden) return false;
        // Vérifier si c'est une personne (fa-user, fa-user-cog) et pas une entreprise (fa-industry)
        const hasIndustry = tooltipHidden.querySelector('.fa-industry');
        const hasUser = tooltipHidden.querySelector('.fa-user, .fa-user-cog');
        return hasUser && !hasIndustry;
    }

    // Créer le bloc d'affichage pour TOUS les dirigeants
    function createDirigeantsAgeBlock(dirigeants) {
        const container = document.createElement('div');
        container.className = 'card_template_section modulr-dirigeant-age-section';

        let htmlContent = `
            <h2 class="tabs_content_title low_margin_top">
                <span class="fa fa-user-tie"></span> Dirigeant${dirigeants.length > 1 ? 's' : ''}
            </h2>
            <div class="block_contrast">
                <div class="modulr-dirigeant-info" style="padding: 10px;">
        `;

        dirigeants.forEach((dirigeant, index) => {
            const age = dirigeant.birthDate ? calculateAge(dirigeant.birthDate) : null;
            const isToday = dirigeant.birthDate ? isBirthdayToday(dirigeant.birthDate) : false;

            // Séparateur entre les dirigeants (sauf le premier)
            if (index > 0) {
                htmlContent += `<hr style="border: none; border-top: 1px solid #ddd; margin: 12px 0;">`;
            }

            htmlContent += `
                <p style="margin: 0 0 8px 0;">
                    <span class="fa fa-user low_margin_right" style="color: var(--color-main);"></span>
                    <a href="${dirigeant.url}" style="font-weight: bold;">${dirigeant.name}</a>
                    ${dirigeant.role ? `<span style="color: #888; font-size: 11px; margin-left: 8px;">(${dirigeant.role})</span>` : ''}
                </p>
            `;

            if (dirigeant.birthDate && age !== null) {
                htmlContent += `
                    <p style="margin: 0 0 5px 0; padding-left: 20px;">
                        <span class="fa fa-birthday-cake low_margin_right" style="color: var(--color-main);"></span>
                        Né(e) le <strong>${dirigeant.birthDate}</strong>
                        <span class="modulr-age-badge" style="
                            display: inline-block;
                            margin-left: 10px;
                            padding: 3px 10px;
                            background-color: ${isToday ? '#d6c491' : 'var(--color-main, #688396)'};
                            color: ${isToday ? '#333' : 'white'};
                            border-radius: 4px;
                            font-weight: bold;
                            font-size: 12px;
                        ">${isToday ? '🎂 ' : ''}${age} ans${isToday ? ' aujourd\'hui !' : ''}</span>
                    </p>
                `;
            } else {
                htmlContent += `
                    <p style="margin: 0 0 5px 0; padding-left: 20px; color: #999; font-style: italic;">
                        <span class="fa fa-info-circle low_margin_right"></span>
                        Date de naissance non renseignée
                    </p>
                `;
            }
        });

        htmlContent += `
                </div>
            </div>
        `;

        container.innerHTML = htmlContent;
        return container;
    }

    // Extraire le nom propre depuis le texte du lien
    function extractName(linkElement) {
        // Cloner pour ne pas modifier l'original
        const clone = linkElement.cloneNode(true);
        // Supprimer les badges (circleText)
        clone.querySelectorAll('.circleText').forEach(el => el.remove());
        // Récupérer le texte nettoyé
        return clone.textContent.trim().replace(/\s+/g, ' ');
    }

    // Fonction principale
    async function init() {
        // Vérifier si c'est une fiche entreprise (icône fa-industry dans le titre)
        const pageTitle = document.querySelector('h1.page_title');
        if (!pageTitle) return;

        const isEnterprise = pageTitle.querySelector('.fa-industry') !== null;
        if (!isEnterprise) {
            // C'est une fiche particulier, on applique juste l'affichage de l'âge classique
            displayAgeOnPersonalCard();
            return;
        }

        // C'est une fiche entreprise - chercher les dirigeants
        const associationsSection = document.querySelector('#clients_users_and_contacts');
        if (!associationsSection) return;

        const dirigeants = [];
        const urlsDejaAjoutes = new Set();

        // MÉTHODE 1 : Chercher le client parent dans "Appartient au client / groupe"
        const h4Elements = associationsSection.querySelectorAll('h4');
        for (const h4 of h4Elements) {
            if (h4.textContent.includes('Appartient au client / groupe')) {
                const nextUl = h4.nextElementSibling;
                if (nextUl && nextUl.tagName === 'UL') {
                    const parentLink = nextUl.querySelector('a[href*="clients_card.php"]');
                    if (parentLink) {
                        const tooltipSpan = parentLink.closest('.tooltip');
                        const hiddenTooltip = tooltipSpan ? tooltipSpan.nextElementSibling : null;

                        // Vérifier si c'est une personne physique
                        if (isPersonFromTooltip(hiddenTooltip)) {
                            const clientUrl = parentLink.href;
                            if (!urlsDejaAjoutes.has(clientUrl)) {
                                const clientName = extractName(parentLink);
                                dirigeants.push({
                                    name: clientName,
                                    url: clientUrl,
                                    role: 'Dirigeant',
                                    birthDate: null
                                });
                                urlsDejaAjoutes.add(clientUrl);
                            }
                        }
                    }
                }
                break;
            }
        }

        // MÉTHODE 2 : Chercher dans "Membres du groupe" les personnes marquées "Dirigeant"
        const allLis = associationsSection.querySelectorAll('li');
        for (const li of allLis) {
            // Vérifier si c'est un dirigeant
            const roleSpan = li.querySelector('span.normal_fade.italic');
            if (!roleSpan) continue;

            const roleText = roleSpan.textContent.trim();
            // Filtrer uniquement les dirigeants (pas les employés, enfants, etc.)
            if (!roleText.includes('Dirigeant')) continue;

            // Récupérer le lien et le nom
            const clientLink = li.querySelector('a[href*="clients_card.php"]');
            if (!clientLink) continue;

            const clientUrl = clientLink.href;

            // Éviter les doublons
            if (urlsDejaAjoutes.has(clientUrl)) continue;

            // Vérifier si c'est une personne physique (pas une entreprise)
            const tooltipSpan = clientLink.closest('.tooltip');
            const hiddenTooltip = tooltipSpan ? tooltipSpan.nextElementSibling : null;

            if (!isPersonFromTooltip(hiddenTooltip)) continue;

            const clientName = extractName(clientLink);
            const role = roleText.replace(/[()]/g, '').trim();

            dirigeants.push({
                name: clientName,
                url: clientUrl,
                role: role,
                birthDate: null
            });
            urlsDejaAjoutes.add(clientUrl);
        }

        if (dirigeants.length === 0) return;

        // Afficher un loader
        const coordSection = document.querySelector('.card_template_section');
        if (!coordSection) return;

        const loader = document.createElement('div');
        loader.className = 'card_template_section modulr-dirigeant-loading';
        loader.innerHTML = `
            <h2 class="tabs_content_title low_margin_top">
                <span class="fa fa-user-tie"></span> Dirigeant${dirigeants.length > 1 ? 's' : ''}
            </h2>
            <div class="block_contrast">
                <p style="padding: 10px; margin: 0;">
                    <span class="fa fa-spinner fa-spin"></span> Chargement des informations (${dirigeants.length} dirigeant${dirigeants.length > 1 ? 's' : ''})...
                </p>
            </div>
        `;
        coordSection.parentNode.insertBefore(loader, coordSection.nextSibling);

        // Récupérer la date de naissance de CHAQUE dirigeant
        for (let i = 0; i < dirigeants.length; i++) {
            dirigeants[i].birthDate = await fetchBirthDate(dirigeants[i].url);
        }

        // Supprimer le loader
        loader.remove();

        // Créer et afficher le bloc avec tous les dirigeants
        const ageBlock = createDirigeantsAgeBlock(dirigeants);
        coordSection.parentNode.insertBefore(ageBlock, coordSection.nextSibling);
    }

    // Affichage de l'âge sur les fiches particuliers (comme avant)
    function displayAgeOnPersonalCard() {
        const labels = document.querySelectorAll('.car_template_field p.normal_fade');

        labels.forEach(label => {
            if (label.textContent.trim() === 'Date de naissance') {
                const valueField = label.nextElementSibling;
                if (valueField && valueField.tagName === 'P' && !valueField.querySelector('.modulr-age-badge')) {
                    const birthDateText = valueField.textContent.trim();

                    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(birthDateText)) return;

                    const age = calculateAge(birthDateText);
                    if (age === null || age < 0) return;

                    const isToday = isBirthdayToday(birthDateText);

                    const ageBadge = document.createElement('span');
                    ageBadge.className = 'modulr-age-badge';
                    ageBadge.style.cssText = `
                        display: inline-block;
                        margin-left: 12px;
                        padding: 3px 10px;
                        background-color: ${isToday ? '#d6c491' : 'var(--color-main, #688396)'};
                        color: ${isToday ? '#333' : 'white'};
                        border-radius: 4px;
                        font-weight: bold;
                        font-size: 12px;
                        vertical-align: middle;
                    `;

                    if (isToday) {
                        ageBadge.innerHTML = `🎂 ${age} ans aujourd'hui !`;
                        ageBadge.title = 'Joyeux anniversaire !';
                    } else {
                        ageBadge.textContent = `${age} ans`;
                        ageBadge.title = `Âge calculé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`;
                    }

                    valueField.appendChild(ageBadge);
                }
            }
        });
    }

    // Lancer le script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

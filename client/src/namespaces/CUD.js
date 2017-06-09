'use strict';

import React, { Component } from 'react';
import { translate } from 'react-i18next';
import { withPageHelpers, Title } from '../lib/page'
import { withForm, Form, FormSendMethod, InputField, TextArea, ButtonRow, Button, TreeTableSelect } from '../lib/form';
import axios from '../lib/axios';
import { withErrorHandling, withAsyncErrorHandler } from '../lib/error-handling';
import interoperableErrors from '../../../shared/interoperable-errors';
import { ModalDialog } from "../lib/bootstrap-components";

@translate()
@withForm
@withPageHelpers
@withErrorHandling
export default class CUD extends Component {
    constructor(props) {
        super(props);

        this.state = {};

        if (props.edit) {
            this.state.nsId = parseInt(props.match.params.nsId);
        }

        this.initFormState();
        this.hasChildren = false;

    }

    isEditGlobal() {
        return this.state.nsId === 1;
    }

    isDelete() {
        return this.props.match.params.action === 'delete';
    }

    removeNsIdSubtree(data) {
        for (let idx = 0; idx < data.length; idx++) {
            const entry = data[idx];

            if (entry.key === this.state.nsId) {
                if (entry.children.length > 0) {
                    this.hasChildren = true;
                }

                data.splice(idx, 1);
                return true;
            }

            if (this.removeNsIdSubtree(entry.children)) {
                return true;
            }
        }
    }

    @withAsyncErrorHandler
    async loadTreeData() {
        axios.get("/namespaces/rest/namespacesTree")
            .then(response => {

                response.data.expanded = true;
                const data = [response.data];

                if (this.props.edit && !this.isEditGlobal()) {
                    this.removeNsIdSubtree(data);
                }

                this.setState({
                    treeData: data
                });
            });
    }

    @withAsyncErrorHandler
    async loadFormValues() {
        await this.getFormValuesFromURL(`/namespaces/rest/namespaces/${this.state.nsId}`, data => {
            if (data.parent) data.parent = data.parent.toString();
        });
    }

    componentDidMount() {
        if (this.props.edit) {
            this.loadFormValues();
        } else {
            this.populateFormValues({
                name: '',
                description: '',
                parent: null
            });
        }

        if (!this.isEditGlobal()) {
            this.loadTreeData();
        }
    }

    validateFormValues(state) {
        const t = this.props.t;

        if (!state.getIn(['name', 'value']).trim()) {
            state.setIn(['name', 'error'], t('Name must not be empty'));
        } else {
            state.setIn(['name', 'error'], null);
        }

        if (!this.isEditGlobal()) {
            if (!state.getIn(['parent', 'value'])) {
                state.setIn(['parent', 'error'], t('Parent Namespace must be selected'));
            } else {
                state.setIn(['parent', 'error'], null);
            }
        }
    }

    async submitHandler() {
        const t = this.props.t;
        const edit = this.props.edit;

        let sendMethod, url;
        if (edit) {
            sendMethod = FormSendMethod.PUT;
            url = `/namespaces/rest/namespaces/${this.state.nsId}`
        } else {
            sendMethod = FormSendMethod.POST;
            url = '/namespaces/rest/namespaces'
        }

        try {
            this.disableForm();
            this.setFormStatusMessage('info', t('Saving namespace ...'));

            const submitSuccessful = await this.validateAndSendFormValuesToURL(sendMethod, url, data => {
                if (data.parent) data.parent = parseInt(data.parent);
            });

            if (submitSuccessful) {
                this.navigateToWithFlashMessage('/namespaces', 'success', t('Namespace saved'));
            } else {
                this.enableForm();
                this.setFormStatusMessage('warning', t('There are errors in the form. Please fix them and submit again.'));
            }

        } catch (error) {
            if (error instanceof interoperableErrors.LoopDetectedError) {
                this.disableForm();
                this.setFormStatusMessage('danger',
                    <span>
                        <strong>{t('Your updates cannot be saved.')}</strong>{' '}
                        {t('There has been a loop detected in the assignment of the parent namespace. This is most likely because someone else has changed the parent of some namespace in the meantime. Refresh your page to start anew with fresh data. Please note that your changes will be lost.')}
                    </span>
                );
                return;
            }

            throw error;
        }
    }

    async showDeleteModal() {
        this.navigateTo(`/namespaces/edit/${this.state.nsId}/delete`);
    }

    async hideDeleteModal() {
        this.navigateTo(`/namespaces/edit/${this.state.nsId}`);
    }

    async performDelete() {
        const t = this.props.t;

        await this.hideDeleteModal();

        try {
            this.disableForm();
            this.setFormStatusMessage('info', t('Deleting namespace...'));

            await axios.delete(`/namespaces/rest/namespaces/${this.state.nsId}`);

            this.navigateToWithFlashMessage('/namespaces', 'success', t('Namespace deleted'));

        } catch (error) {
            if (error instanceof interoperableErrors.ChildDetectedError) {
                this.disableForm();
                this.setFormStatusMessage('danger',
                    <span>
                        <strong>{t('The namespace cannot be deleted.')}</strong>{' '}
                        {t('There has been a child namespace found. This is most likely because someone else has changed the parent of some namespace in the meantime. Refresh your page to start anew with fresh data.')}
                    </span>
                );
                return;
            }

            throw error;
        }
    }

    render() {
        const t = this.props.t;
        const edit = this.props.edit;

        return (
            <div>
                {!this.isEditGlobal() && !this.hasChildren && edit &&
                    <ModalDialog hidden={!this.isDelete()} title={t('Confirm deletion')} onCloseAsync={::this.hideDeleteModal} buttons={[
                        { label: t('No'), className: 'btn-primary', onClickAsync: ::this.hideDeleteModal },
                        { label: t('Yes'), className: 'btn-danger', onClickAsync: ::this.performDelete }
                    ]}>
                        {t('Are you sure you want to delete namespace "{{namespace}}"?', {namespace: this.getFormValue('name')})}
                    </ModalDialog>
                }

                <Title>{edit ? t('Edit Namespace') : t('Create Namespace')}</Title>

                <Form stateOwner={this} onSubmitAsync={::this.submitHandler}>
                    <InputField id="name" label={t('Name')}/>
                    <TextArea id="description" label={t('Description')}/>

                    {!this.isEditGlobal() &&
                    <TreeTableSelect id="parent" label={t('Parent Namespace')} data={this.state.treeData}/>}

                    <ButtonRow>
                        <Button type="submit" className="btn-primary" icon="ok" label={t('Save')}/>
                        {!this.isEditGlobal() && !this.hasChildren && edit && <Button className="btn-danger" icon="remove" label={t('Delete Namespace')}
                                         onClickAsync={::this.showDeleteModal}/>}
                    </ButtonRow>
                </Form>
            </div>
        );
    }
}